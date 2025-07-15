import { Form, useActionData, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { paintColors } from "../utils/prompts";
import { convertFileToBase64, convertToPng } from "./api/helpers";
import { PreviewThumbnail } from "../components/PreviewThumbnail";
import ImageFlipper from "../components/ImageFlipper";

// Define ActionFunctionArgs type since it's not exported from @react-router/node
type ActionFunctionArgs = {
	request: Request;
	params: Record<string, string>;
};

// Helper function to create JSON responses
const json = (data: any, status: number = 200) => {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
		},
	});
};

export async function action({ request }: ActionFunctionArgs) {
	// Import SQLite utilities only in server-side code
	const { storeImage } = await import("../utils/sqlite.server");
	// Import the wallPrompt from prompts.ts
	const { wallPrompt } = await import("../utils/prompts");

	// Process the form data here to avoid double consumption
	const formData = await request.formData();
	const colorHex = formData.get("colorHex") as string;
	const file = formData.get("image") as File;
	const maskFile = (formData.get("mask") as File) || null;

	// Validate file type - OpenAI requires PNG
	const validTypes = ["image/png"];
	if (!validTypes.includes(file.type)) {
		return json(
			{
				error: `Unsupported image format: ${file.type}. Please use PNG format.`,
			},
			400
		);
	}

	// Validate mask file type if provided
	if (maskFile && !validTypes.includes(maskFile.type)) {
		return json(
			{
				error: `Unsupported mask format: ${maskFile.type}. Please use PNG format.`,
			},
			400
		);
	}

	// Replace {{color}} placeholder with the selected color hex value
	const prompt = wallPrompt.replace("{{color}}", colorHex);

	console.log("Form data received:", {
		colorHex,
		prompt,
		fileName: file?.name,
		maskFileName: maskFile?.name,
	});

	if (!file) {
		return json({ error: "Image is required" }, 400);
	}

	try {
		const imageId = uuidv4();

		const imageBase64 = await convertFileToBase64(file);
		// Store an empty image with a status of "pending"
		await storeImage(imageId, imageBase64, { status: "pending" });

		// Process the image and prompt directly with the extracted data
		processAndStoreImage(imageId, prompt, file, maskFile);

		console.log("Image stored in SQLite with ID:", imageId);
		return json({ response: { imageId, imageBase64 } });
	} catch (error) {
		console.log(error);
		return json({ error: "Failed to process image and prompt" }, 500);
	}
}

const processAndStoreImage = async (
	imageId: string,
	prompt: string,
	file: File,
	maskFile: File | null
) => {
	const { storeImage } = await import("../utils/sqlite.server");
	const { processImageAndPrompt } = await import("./api/chatgpt");

	const response = await processImageAndPrompt(prompt, file, maskFile);

	if (!response) return;

	// Check if there was an error from the API
	if (response.error) {
		// Update the status to error with the error message
		await storeImage(imageId, "", {
			fileName: file.name,
			timestamp: new Date().toISOString(),
			status: "error",
			errorMessage: response.error,
		});
		return;
	}

	// Extract the base64 data from the data URL
	const base64Data = response.image.split(";base64,").pop() as string;

	// Store the image in SQLite with metadata
	await storeImage(imageId, base64Data, {
		fileName: file.name,
		timestamp: new Date().toISOString(),
		status: "completed",
	});
};

export function meta() {
	return [
		{ title: "Image Upload with ChatGPT" },
		{
			name: "description",
			content: "Upload an image and get a response from ChatGPT",
		},
	];
}

// Color swatch component for paint color selection
function ColorSwatch({
	color,
	selectedColor,
	setSelectedColor,
}: {
	color: { name: string; hex: string };
	selectedColor: { name: string; hex: string } | null;
	setSelectedColor: (color: { name: string; hex: string }) => void;
}) {
	const isSelected = selectedColor?.hex === color.hex;
	return (
		<button
			type="button"
			className={`flex flex-col items-center p-2 rounded-md transition-all ${
				isSelected ? "ring-2 ring-indigo-500 scale-105" : "hover:scale-105"
			}`}
			onClick={() => setSelectedColor(color)}
		>
			<div
				className="w-full h-12 rounded-md mb-1 border border-gray-300"
				style={{ backgroundColor: color.hex }}
			/>
			<span className="text-xs text-gray-700 truncate w-full text-center">
				{color.name}
			</span>
		</button>
	);
}

export default function ImageUpload() {
	// Define ActionData type for the return value of the action function
	type ActionData =
		| {
				response: {
					imageId: string;
					imageBase64: string;
				};
				error?: undefined;
		  }
		| {
				response?: undefined;
				error: string;
		  }
		| undefined;
	const actionData = useActionData<typeof action>() as ActionData;
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";
	const [previewImage, setPreviewImage] = useState<string | null>(null);
	const [previewMaskImage, setPreviewMaskImage] = useState<string | null>(null);
	const [sentImage, setSentImage] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [selectedMaskFile, setSelectedMaskFile] = useState<File | null>(null);
	const [processingStatus, setProcessingStatus] = useState<string | null>(null);
	const [imageReady, setImageReady] = useState(false);
	const [selectedColor, setSelectedColor] = useState(paintColors[0]);

	// State for API error messages
	const [apiError, setApiError] = useState<string | null>(null);

	// Poll for image status updates
	useEffect(() => {
		let intervalId: number;
		let isMounted = true;

		const checkImageStatus = async () => {
			if (!actionData?.response?.imageId) return;

			try {
				// Fetch the image status from the server
				const response = await fetch(
					`/api/image/${actionData.response.imageId}/status`
				);
				if (!response.ok) throw new Error("Failed to fetch image status");

				const data = await response.json();

				if (isMounted) {
					setProcessingStatus(data.status);

					// Handle error status
					if (data.status === "error") {
						setApiError(data.errorMessage || "An error occurred while processing the image");
						clearInterval(intervalId);
					}
					// If processing is complete, stop polling
					else if (data.status === "completed") {
						setImageReady(true);
						clearInterval(intervalId);
					}
				}
			} catch (error) {
				console.error("Error checking image status:", error);
			}
		};

		if (actionData?.response?.imageId) {
			// Reset error state when starting a new request
			setApiError(null);
			
			// Initial check
			checkImageStatus();

			// Set up polling every 2 seconds
			intervalId = window.setInterval(checkImageStatus, 2000);
		}

		return () => {
			isMounted = false;
			if (intervalId) clearInterval(intervalId);
		};
	}, [actionData?.response?.imageId]);

	// Handle file input change
	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			try {
				// Convert to PNG immediately
				const pngFile = await convertToPng(file);

				// Create a preview URL from the PNG file
				const previewUrl = URL.createObjectURL(pngFile);
				setPreviewImage(previewUrl);
				setSelectedFile(pngFile);
			} catch (error) {
				console.error("Error converting image to PNG:", error);
				// Fallback to original file if conversion fails
				setPreviewImage(URL.createObjectURL(file));
				setSelectedFile(file);
			}
		} else {
			setPreviewImage(null);
			setSelectedFile(null);
		}
	};

	// Handle mask file input change
	const handleMaskFileChange = async (
		e: React.ChangeEvent<HTMLInputElement>
	) => {
		const file = e.target.files?.[0];
		if (file) {
			try {
				// Convert to PNG immediately
				const pngFile = await convertToPng(file);

				// Create a preview URL from the PNG file
				const previewUrl = URL.createObjectURL(pngFile);
				setPreviewMaskImage(previewUrl);
				setSelectedMaskFile(pngFile);
			} catch (error) {
				console.error("Error converting mask to PNG:", error);
				// Fallback to original file if conversion fails
				setPreviewMaskImage(URL.createObjectURL(file));
				setSelectedMaskFile(file);
			}
		} else {
			setPreviewMaskImage(null);
			setSelectedMaskFile(null);
		}
	};

	return (
		<div className="container mx-auto p-8">
			<h1 className="text-3xl font-bold mb-8">Paint Visualizer</h1>

			<Form
				method="post"
				className="space-y-6"
				encType="multipart/form-data"
				onSubmit={(e) => {
					// Don't prevent default - let React Router handle the submission
					// Just replace the file input value with our PNG file from state
					if (selectedFile) {
						// Find the file input element
						const fileInput = e.currentTarget.querySelector(
							"#image"
						) as HTMLInputElement;

						// Create a DataTransfer to set the files
						const dataTransfer = new DataTransfer();
						dataTransfer.items.add(selectedFile);

						// Set the file input's files to our PNG file
						fileInput.files = dataTransfer.files;
					}

					// Do the same for mask file if it exists
					if (selectedMaskFile) {
						// Find the mask file input element
						const maskFileInput = e.currentTarget.querySelector(
							"#mask"
						) as HTMLInputElement;

						// Create a DataTransfer to set the files
						const dataTransfer = new DataTransfer();
						dataTransfer.items.add(selectedMaskFile);

						// Set the file input's files to our PNG file
						maskFileInput.files = dataTransfer.files;
					}
				}}
			>
				{/* Show error message if there is one */}
				{actionData?.error && (
					<div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">
						{actionData.error}
					</div>
				)}
				<div>
					<label
						htmlFor="colorPicker"
						className="block text-sm font-medium text-gray-700 mb-2"
					>
						Select Wall Paint Color
					</label>
					<div className="grid grid-cols-3 md:grid-cols-6 gap-3">
						{paintColors.map((color) => (
							<ColorSwatch
								key={color.hex}
								color={color}
								selectedColor={selectedColor}
								setSelectedColor={setSelectedColor}
							/>
						))}
					</div>
					<input
						type="hidden"
						name="colorHex"
						value={selectedColor?.hex || paintColors[0].hex}
					/>
				</div>

				<div>
					<label
						htmlFor="image"
						className="block text-sm font-medium text-gray-700"
					>
						Upload Photo
					</label>
					<input
						type="file"
						id="image"
						name="image"
						accept="image/*"
						className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
						required
						onChange={handleFileChange}
					/>
				</div>

				<div>
					<label
						htmlFor="mask"
						className="block text-sm font-medium text-gray-700"
					>
						Upload Mask (Optional)
					</label>
					<p className="text-xs text-gray-500 mb-1">
						A black and white image where white areas indicate regions to be
						modified
					</p>
					<input
						type="file"
						id="mask"
						name="mask"
						accept="image/*"
						className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
						onChange={handleMaskFileChange}
					/>
					<div className="flex gap-4">
						{previewImage && (
							<PreviewThumbnail
								src={previewImage}
								alt="Preview"
								title="uploaded image:"
								onLoad={() => {
									// Free memory when the image is loaded
									URL.revokeObjectURL(previewImage);
								}}
							/>
						)}
						{previewMaskImage && (
							<PreviewThumbnail
								src={previewMaskImage}
								alt="Mask Preview"
								title="uploaded mask:"
								showCheckerboard={true}
								onLoad={() => {
									// Free memory when the image is loaded
									URL.revokeObjectURL(previewMaskImage);
								}}
							/>
						)}
						{actionData?.response?.imageBase64 && (
							<PreviewThumbnail
								src={`data:image/png;base64,${actionData.response.imageBase64}`}
								alt="Sent"
								title="processed:"
							/>
						)}
					</div>
				</div>

				<div className="mt-6">
					<button
						type="submit"
						disabled={isSubmitting}
						className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
							isSubmitting
								? "bg-indigo-400 cursor-not-allowed"
								: "bg-indigo-600 hover:bg-indigo-700"
						} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
					>
						{isSubmitting ? (
							<>
								<svg
									className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										className="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										strokeWidth="4"
									></circle>
									<path
										className="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path>
								</svg>
								Processing...
							</>
						) : (
							"Generate Paint Preview"
						)}
					</button>
				</div>
			</Form>

			{/* Show loading state while submitting */}
			{isSubmitting && !actionData?.response && (
				<div className="mt-8 p-6 bg-gray-50 rounded-lg shadow flex flex-col items-center justify-center">
					<div className="animate-pulse flex space-x-4 w-full">
						<div className="flex-1 space-y-6 py-1">
							<div className="h-40 bg-gray-200 rounded"></div>
							<div className="space-y-3">
								<div className="h-2 bg-gray-200 rounded"></div>
								<div className="h-2 bg-gray-200 rounded"></div>
								<div className="h-2 bg-gray-200 rounded"></div>
							</div>
						</div>
					</div>
					<p className="text-gray-500 mt-4">
						Processing your image and prompt...
					</p>
				</div>
			)}

			{actionData?.response && (
				<div className="mt-8 p-6 bg-gray-50 rounded-lg shadow">
					<h2 className="text-xl font-semibold mb-4">Result Image:</h2>
					<div className="mt-4 flex flex-col md:flex-row gap-6">
						{/* Display the returned image or loading indicator */}
						<div className="w-full">
							<div className="relative border aspect-square border-gray-300 rounded-md overflow-hidden">
								{processingStatus === "completed" ? (
									<>
										<ImageFlipper
											image1={`data:image/png;base64,${actionData.response.imageBase64}`}
											image2={`/api/image/${actionData.response.imageId}`}
											alt1="Original Image"
											alt2="Processed Image"
											className="w-full h-full"
										/>
									</>
								) : processingStatus === "error" ? (
									<>
										<div className="flex items-center justify-center h-64 bg-red-50">
											<div className="text-center p-4">
												<svg className="mx-auto h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
												</svg>
												<h3 className="mt-2 text-sm font-medium text-red-800">Processing Error</h3>
												<p className="mt-1 text-sm text-red-700">{apiError || "An error occurred while processing your image"}</p>
											</div>
										</div>
									</>
								) : (
									<>
										<div className="flex items-center justify-center h-64 bg-gray-100">
											<div className="text-center p-4">
												<div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-2"></div>
												<p className="text-gray-600">Processing image...</p>
											</div>
										</div>
									</>
								)}
							</div>
						</div>
					</div>
				</div>
			)}

			{actionData?.error && (
				<div className="mt-8 p-4 bg-red-50 rounded-md">
					<p className="text-red-700">{actionData.error}</p>
				</div>
			)}
		</div>
	);
}

import { Form, useActionData, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { wallPrompt } from "../utils/prompts";
import { convertFileToBase64 } from "./api/helpers";

/**
 * Converts any image file to PNG format in-memory without saving to disk
 * Uses Canvas API which is compatible with ESM
 */
async function convertToPng(file: File): Promise<File> {
	// Create a blob URL from the file
	const blobUrl = URL.createObjectURL(file);

	// Create an image element to load the file
	const img = new Image();

	// Wait for the image to load
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = blobUrl;
	});

	// Create a canvas to draw the image with target dimensions 1024x1024
	const canvas = document.createElement("canvas");
	canvas.width = 1024;
	canvas.height = 1024;

	// Get the canvas context
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to get canvas context");
	}

	// Calculate dimensions for cropping to maintain aspect ratio
	let sourceX = 0;
	let sourceY = 0;
	let sourceWidth = img.width;
	let sourceHeight = img.height;

	// If the image is not square, crop it to make it square
	if (sourceWidth !== sourceHeight) {
		if (sourceWidth > sourceHeight) {
			// Landscape image: crop the sides
			sourceX = (sourceWidth - sourceHeight) / 2;
			sourceWidth = sourceHeight;
		} else {
			// Portrait image: crop the top and bottom
			sourceY = (sourceHeight - sourceWidth) / 2;
			sourceHeight = sourceWidth;
		}
	}

	// Draw the image on the canvas with cropping and resizing
	ctx.drawImage(
		img,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		0,
		0,
		1024,
		1024
	);

	// Clean up the blob URL
	URL.revokeObjectURL(blobUrl);

	// Convert the canvas to a PNG blob
	const blob = await new Promise<Blob>((resolve) => {
		canvas.toBlob((b) => {
			if (!b) {
				throw new Error("Failed to create blob");
			}
			resolve(b);
		}, "image/png");
	});

	// Create a new File object with the PNG blob
	return new File([blob], file.name.replace(/\.[^\.]+$/, ".png"), {
		type: "image/png",
		lastModified: file.lastModified,
	});
}

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
	// Import Redis utilities only in server-side code
	const { storeImage } = await import("../utils/redis.server");

	// Process the form data here to avoid double consumption
	const formData = await request.formData();
	const prompt = formData.get("prompt") as string;
	const file = formData.get("image") as File;

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

	console.log("Form data received:", { prompt, fileName: file?.name });

	if (!file) {
		return json({ error: "Image is required" }, 400);
	}

	try {
		const imageId = uuidv4();

		const imageBase64 = await convertFileToBase64(file);
		// Store an empty image with a status of "pending"
		await storeImage(imageId, imageBase64, { status: "pending" });

		// Process the image and prompt directly with the extracted data
		processAndStoreImage(imageId, prompt, file);

		console.log("Image stored in Redis with ID:", imageId);
		return json({ response: { imageId, imageBase64 } });
	} catch (error) {
		console.log(error);
		return json({ error: "Failed to process image and prompt" }, 500);
	}
}

const processAndStoreImage = async (
	imageId: string,
	prompt: string,
	file: File
) => {
	const { storeImage } = await import("../utils/redis.server");
	const { processImageAndPrompt } = await import("./api/chatgpt");

	const response = await processImageAndPrompt(prompt, file);

	if (!response) return;

	// Extract the base64 data from the data URL
	const base64Data = response.image.split(";base64,").pop() as string;

	// Store the image in Redis with metadata
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
	const [sentImage, setSentImage] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [processingStatus, setProcessingStatus] = useState<string | null>(null);
	const [imageReady, setImageReady] = useState(false);

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

					// If processing is complete, stop polling
					if (data.status === "completed") {
						setImageReady(true);
						clearInterval(intervalId);
					}
				}
			} catch (error) {
				console.error("Error checking image status:", error);
			}
		};

		if (actionData?.response?.imageId) {
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
						htmlFor="prompt"
						className="block text-sm font-medium text-gray-700"
					>
						Prompt
					</label>
					<textarea
						id="prompt"
						name="prompt"
						rows={4}
						className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						placeholder="Describe what you want ChatGPT to analyze about the image..."
					>
						{wallPrompt}
					</textarea>
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
					<div className="flex gap-4">
						{previewImage && (
							<div className="mt-4">
								<p className="text-sm text-gray-500 mb-2">uploaded:</p>
								<div className="relative w-32 h-32 overflow-hidden rounded-md border border-gray-300">
									<img
										src={previewImage}
										alt="Preview"
										className="object-cover w-full h-full"
										onLoad={() => {
											// Free memory when the image is loaded
											URL.revokeObjectURL(previewImage);
										}}
									/>
								</div>
							</div>
						)}
						{actionData?.response?.imageBase64 && (
							<div className="mt-4">
								<p className="text-sm text-gray-500 mb-2">processed:</p>
								<div className="relative w-32 h-32 overflow-hidden rounded-md border border-gray-300">
									<img
										className="inset-0 absolute"
										src={`data:image/png;base64,${actionData.response.imageBase64}`}
										alt="Sent"
									/>
								</div>
							</div>
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
							<div className="relative border border-gray-300 rounded-md overflow-hidden">
								{processingStatus === "completed" ? (
									<img
										src={`/api/image/${actionData.response.imageId}`}
										alt="Processed"
										className="w-full h-auto"
									/>
								) : (
									<>
										<div className="flex items-center justify-center h-64 bg-gray-100">
											<div className="text-center p-4">
												<div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-2"></div>
												<p className="text-gray-600">"Processing image..."</p>
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

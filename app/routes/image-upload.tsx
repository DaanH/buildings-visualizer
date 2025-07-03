import { Form, useActionData, useNavigation } from "react-router";
import * as React from "react";
import { v4 as uuidv4 } from "uuid";

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

	console.log("Form data received:", { prompt, fileName: file?.name });

	if (!file) {
		return json({ error: "Image is required" }, 400);
	}

	try {
		const imageId = uuidv4();

		// Store an empty image with a status of "pending"
		await storeImage(imageId, null, { status: "pending" });

		// Process the image and prompt directly with the extracted data
		processAndStoreImage(imageId, prompt, file);

		console.log("Image stored in Redis with ID:", imageId);
		return json({ response: { imageId } });
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

	const mockResponse = await processImageAndPrompt(prompt, file);

	// Extract the base64 data from the data URL
	const base64Data = mockResponse.image.split(";base64,").pop() as string;

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
	const [previewImage, setPreviewImage] = React.useState<string | null>(null);
	const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
	const [processingStatus, setProcessingStatus] = React.useState<string | null>(
		null
	);
	const [imageReady, setImageReady] = React.useState(false);

	// Poll for image status updates
	React.useEffect(() => {
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
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			// Create a preview URL
			setPreviewImage(URL.createObjectURL(file));
			setSelectedFile(file);
		} else {
			setPreviewImage(null);
			setSelectedFile(null);
		}
	};

	return (
		<div className="container mx-auto p-8">
			<h1 className="text-3xl font-bold mb-8">Image Upload with ChatGPT</h1>

			<Form method="post" className="space-y-6" encType="multipart/form-data">
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
						Your Prompt
					</label>
					<textarea
						id="prompt"
						name="prompt"
						rows={4}
						className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						placeholder="Describe what you want ChatGPT to analyze about the image..."
					/>
				</div>

				<div>
					<label
						htmlFor="image"
						className="block text-sm font-medium text-gray-700"
					>
						Upload Image
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

					{previewImage && (
						<div className="mt-4">
							<p className="text-sm text-gray-500 mb-2">Preview:</p>
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
							"Submit for Analysis"
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
					<h2 className="text-xl font-semibold mb-4">Processed Image:</h2>
					<div className="mt-4 flex flex-col md:flex-row gap-6">
						{/* Display the returned image or loading indicator */}
						<div className="w-full md:w-1/3">
							<div className="border border-gray-300 rounded-md overflow-hidden">
								{processingStatus === "completed" ? (
									<img
										src={`/api/image/${actionData.response.imageId}`}
										alt="Processed"
										className="w-full h-auto"
									/>
								) : (
									<div className="flex items-center justify-center h-64 bg-gray-100">
										<div className="text-center p-4">
											<div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-2"></div>
											<p className="text-gray-600">
												{processingStatus === "pending"
													? "Processing image..."
													: "Waiting for status..."}
											</p>
										</div>
									</div>
								)}
							</div>
						</div>

						{/* Display the status information */}
						<div className="w-full md:w-2/3">
							<div className="bg-white p-4 rounded-md border border-gray-300">
								<h3 className="font-medium text-gray-900 mb-2">Status:</h3>
								<p className="text-gray-700 whitespace-pre-line">
									{processingStatus === "completed"
										? "Image processing complete!"
										: processingStatus === "pending"
										? "Your image is being processed. This may take a few seconds..."
										: "Waiting for status update..."}
								</p>
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

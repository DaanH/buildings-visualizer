/**
 * This file contains utility functions for processing images and prompts.
 * It uses the OpenAI API to generate images with colored walls based on user prompts.
 */

import { OpenAI, type Uploadable } from "openai";

// Define types for OpenAI API requests
type ChatCompletionMessageParam = {
	role: "system" | "user" | "assistant";
	content:
		| string
		| null
		| Array<{
				type: "text" | "image_url";
				text?: string;
				image_url?: {
					url: string;
				};
		  }>;
	tool_calls?: Array<any>;
};

/**
 * Convert a file to base64 encoding
 */
async function convertFileToBase64(file: File): Promise<string> {
	// Get the file data as a buffer
	let fileData: ArrayBuffer | Buffer;

	console.log("File type:", file.type, "File name:", file.name);

	// Check what methods are available on the file object
	const methods = Object.keys(file).filter(
		(key) => typeof (file as any)[key] === "function"
	);
	console.log("Available methods on file:", methods);

	// Try different approaches to get the file data
	if (typeof (file as any).stream === "function") {
		console.log("Using stream method");
		// This is a Node.js specific approach
		const chunks: Buffer[] = [];
		const stream = (file as any).stream();
		for await (const chunk of stream) {
			chunks.push(Buffer.from(chunk));
		}
		fileData = Buffer.concat(chunks);
	} else if ((file as any).buffer) {
		console.log("Using buffer property");
		fileData = (file as any).buffer;
	} else {
		throw new Error("Unsupported file data");
	}

	// Convert to base64 string
	if (typeof Buffer !== "undefined" && Buffer.isBuffer(fileData)) {
		// Node.js Buffer
		return (fileData as Buffer).toString("base64");
	} else {
		// Browser ArrayBuffer
		const uint8Array = new Uint8Array(fileData as ArrayBuffer);

		// Convert to binary string in chunks to avoid call stack issues
		const chunkSize = 8192;
		let binaryString = "";

		for (let i = 0; i < uint8Array.length; i += chunkSize) {
			const chunk = Array.from(uint8Array.slice(i, i + chunkSize));
			binaryString += String.fromCharCode.apply(null, chunk);
		}

		// Finally encode as base64
		return btoa(binaryString);
	}
}

async function generateImageWithGptResponse(
	apiKey: string,
	prompt: string,
	file: File
): Promise<string> {
	const openai = new OpenAI({ apiKey });

	const base64Image = await convertFileToBase64(file);

	const response = await openai.responses.create({
		model: "gpt-4.1",
		input: [
			{
				role: "user",
				content: [
					{
						type: "input_text",
						text: prompt,
					},
					{
						type: "input_image",
						image_url: `data:image/jpeg;base64,${base64Image}`,
						detail: "low",
					},
				],
			},
		],
		tools: [{ type: "image_generation" }],
	});

	const imageData = response.output
		.filter((output) => output.type === "image_generation_call")
		.map((output) => output.result);

	if (imageData.length > 0) {
		const imageBase64 = imageData[0];
		if (imageBase64) {
			const fs = await import("fs");
			fs.writeFileSync("gift-basket.png", Buffer.from(imageBase64, "base64"));
			return imageBase64;
		}
	} else {
		console.log(response.output);
	}

	return "";
}

/**
 * Generate an image using OpenAI API directly with gpt-image-1
 */
async function generateImageWithGptImage(
	apiKey: string,
	prompt: string,
	file: File
): Promise<string> {
	console.log("Generating image with OpenAI gpt-image-1 API");
	console.log("Using prompt:", prompt);

	// Initialize the OpenAI client
	const openai = new OpenAI({
		apiKey: apiKey,
	});

	try {
		// Now use gpt-image-1 to generate the image based on the detailed description
		const imageResponse = await openai.images.edit({
			model: "dall-e-2",
			prompt: prompt,
			image: file,
			n: 1,
			size: "1024x1024",
		});
		console.log("Image response:", imageResponse);

		// Extract the base64 image from the response
		const generatedImageBase64 = imageResponse.data?.[0]?.b64_json;
		if (!generatedImageBase64) {
			throw new Error("No image data received from GPT Image API");
		}

		// Log successful image generation
		console.log("GPT Image successfully generated");
		console.log("Image format:", "PNG (Base64)");

		return generatedImageBase64;
	} catch (error: any) {
		console.error("API error:", error);
		throw new Error(`API error: ${error.message || JSON.stringify(error)}`);
	}
}

/**
 * Process an image and prompt to generate a response using OpenAI API
 * This function can be called directly from other routes
 */
export async function processImageAndPrompt(
	prompt: string,
	file: File
): Promise<{
	image: string;
	imageId?: string;
} | null> {
	console.log("Calling OpenAI API with image and prompt");

	// Get API key from environment variable
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error("Missing OpenAI API key");
		return null;
	}

	try {
		// Generate image directly using GPT-4 Vision
		const generatedImageBase64 = await generateImageWithGptResponse(
			apiKey,
			prompt,
			file
		);

		return {
			image: `data:image/png;base64,${generatedImageBase64}`,
		};
	} catch (error) {
		console.error("Error calling OpenAI API:", error);
		return null;
	}
}

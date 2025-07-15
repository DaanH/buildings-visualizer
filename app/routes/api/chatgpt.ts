/**
 * This file contains utility functions for processing images and prompts.
 * It uses the OpenAI API to generate images with colored walls based on user prompts.
 */

import { OpenAI, type Uploadable } from "openai";
import { convertFileToBase64 } from "./helpers";

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

async function generateImageWithGptResponse(
	apiKey: string,
	prompt: string,
	file: File
): Promise<string> {
	const openai = new OpenAI({ apiKey });

	const base64Image = await convertFileToBase64(file);

	const response = await openai.responses.create({
		model: "gpt-image-1",
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
						detail: "auto",
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
	file: File,
	maskFile: File | null
): Promise<string> {
	console.log("Generating image with OpenAI gpt-image-1 API");
	console.log("Using prompt:", prompt);

	// Initialize the OpenAI client
	const openai = new OpenAI({
		apiKey: apiKey,
	});

	try {
		// Now use gpt-image-1 to generate the image based on the detailed description
		let imageResponse;
		if (maskFile) {
			console.log("Using mask file:", maskFile.name);
			// If mask is provided, use it in the API call
			imageResponse = await openai.images.edit({
				// model: "dall-e-2",
				model: "gpt-image-1",
				prompt: prompt,
				image: file,
				mask: maskFile,
				n: 1,
				size: "1024x1024",
				quality: "medium",
			});
		} else {
			console.log("No mask file provided");
			// If no mask is provided, use the standard edit API
			imageResponse = await openai.images.edit({
				model: "gpt-image-1",
				prompt: prompt,
				image: file,
				n: 1,
				size: "1024x1024",
				quality: "medium",
			});
		}
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
		// Instead of throwing, return the error message
		throw new Error(`API error: ${error.message || JSON.stringify(error)}`);
	}
}

/**
 * Process an image and prompt to generate a response using OpenAI API
 * This function can be called directly from other routes
 */
export async function processImageAndPrompt(
	prompt: string,
	file: File,
	maskFile: File | null = null
): Promise<{
	image: string;
	imageId?: string;
	error?: string;
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
		const generatedImageBase64 = await generateImageWithGptImage(
			apiKey,
			prompt,
			file,
			maskFile
		);

		return {
			image: `data:image/png;base64,${generatedImageBase64}`,
		};
	} catch (error: any) {
		console.error("Error calling OpenAI API:", error);
		// Return the error message instead of null
		return {
			image: "",
			error: error.message || "An error occurred while processing the image",
		};
	}
}

export async function convertFileToBase64(file: File): Promise<string> {
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

/**
 * Converts any image file to PNG format in-memory without saving to disk
 * Uses Canvas API which is compatible with ESM
 */
export async function convertToPng(file: File): Promise<File> {
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

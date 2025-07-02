/**
 * This file contains utility functions for processing images and prompts.
 * It was previously used as an API route but is now used directly as a module.
 */

// Mock delay to simulate API latency
const mockDelay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Process an image and prompt to generate a mock response
 * This function can be called directly from other routes
 */
export async function processImageAndPrompt(prompt: string, file: File) {
  // Read file data as array buffer and convert to base64
  let base64Image = "";

  try {
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
      base64Image = (fileData as Buffer).toString("base64");
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
      base64Image = btoa(binaryString);
    }

    console.log("Image successfully encoded, size:", base64Image.length);
  } catch (fileError) {
    console.error("Error reading file:", fileError);
    // Fallback to a placeholder image if we can't read the file
    base64Image = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // 1x1 transparent GIF
  }

  console.log("Processing image and prompt");
  // Add a delay to simulate API call
  await mockDelay(1500);

  // Create a mock response that includes the image and prompt
  return {
    image: `data:${file.type || "image/jpeg"};base64,${base64Image}`,
    analysis:
      `This is a mock analysis of the image based on your prompt: "${prompt}".\n\n` +
      `The image you uploaded appears to be ${
        file.size > 1000000 ? "large" : "small"
      } (${(file.size / 1024).toFixed(2)} KB).\n\n` +
      `File type: ${file.type}\n` +
      `File name: ${file.name}\n\n` +
      `This is where the ChatGPT API would normally provide an analysis of your image based on your prompt.\n\n` +
      `Your prompt was: ${prompt}`,
  };
}



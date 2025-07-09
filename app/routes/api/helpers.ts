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

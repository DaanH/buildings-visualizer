/**
 * API endpoint to retrieve images from Redis
 * GET /api/image/:imageId - Returns the image data with content type
 */
import { getImage } from "../../utils/redis.server";

// Define LoaderFunctionArgs type since it's not exported from @react-router/node
type LoaderFunctionArgs = {
	request: Request;
	params: Record<string, string>;
};

export async function loader({ params }: LoaderFunctionArgs) {
	const { imageId } = params;

	if (!imageId) {
		return new Response("Image ID is required", { status: 400 });
	}

	try {
		// Get image from Redis
		const imageData = await getImage(imageId);

		if (!imageData) {
			return new Response("Image not found", { status: 404 });
		}

		// Get content type from metadata or default to jpeg
		const contentType = imageData.fileType || "image/jpeg";

		// Return image as binary response with proper content type
		return new Response(Buffer.from(imageData.data, "base64"), {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=31536000", // Cache for 1 year
			},
		});
	} catch (error) {
		console.error("Error retrieving image:", error);
		return new Response("Failed to retrieve image", { status: 500 });
	}
}

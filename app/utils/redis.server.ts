/**
 * Redis client utility for server-side operations
 * This file should only be imported in server-side code (actions, loaders)
 */
import { createClient } from "redis";

const EXPIRY_SECONDS = 60 * 60 * 24 * 7;

// Create Redis client singleton
let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Get or create Redis client instance
 */
async function getRedisClient() {
	if (!redisClient) {
		// Create a new Redis client
		redisClient = createClient({
			url: process.env.REDIS_URL || "redis://localhost:6379",
		});

		// Set up error handling
		redisClient.on("error", (err) => {
			console.error("Redis client error:", err);
		});

		// Connect to Redis
		await redisClient.connect();
	}

	return redisClient;
}

/**
 * Store an image in Redis
 * @param imageId - Unique identifier for the image
 * @param imageData - Image data as base64 string or Buffer
 * @param metadata - Optional metadata about the image
 * @param expirySeconds - Optional TTL in seconds (0 = no expiry)
 */
export async function storeImage(
	imageId: string,
	imageData: string | Buffer | null,
	metadata: Record<string, any> = {}
) {
	const client = await getRedisClient();

	// Convert Buffer to base64 string if needed
	const imageStr = Buffer.isBuffer(imageData)
		? imageData.toString("base64")
		: imageData;

	// Store image in a hash with metadata
	const imageKey = `image:${imageId}`;

	// Use multi to perform operations atomically
	const multi = client.multi();

	console.log(
		"storing image in Redis with key:",
		imageKey,
		", ",
		imageStr?.substring(0, 100) || "[empty]"
	);
	if (imageStr) multi.hSet(imageKey, "data", imageStr);

	// Store metadata fields
	for (const [key, value] of Object.entries(metadata)) {
		multi.hSet(imageKey, key, JSON.stringify(value));
	}

	multi.expire(imageKey, EXPIRY_SECONDS);

	await multi.exec();

	return imageKey;
}

/**
 * Retrieve an image from Redis
 * @param imageId - Unique identifier for the image
 * @returns Object containing image data and metadata, or null if not found
 */
export async function getImage(imageId: string) {
	const client = await getRedisClient();
	const imageKey = `image:${imageId}`;

	// Get all fields from the hash
	const imageData = await client.hGetAll(imageKey);

	// If no data found, return null
	if (!imageData || Object.keys(imageData).length === 0) {
		return null;
	}

	// Parse JSON fields
	const parsedData: Record<string, any> = {};
	for (const [key, value] of Object.entries(imageData)) {
		if (key !== "data") {
			try {
				parsedData[key] = JSON.parse(value);
			} catch {
				parsedData[key] = value;
			}
		} else {
			parsedData[key] = value;
		}
	}

	return parsedData;
}

/**
 * Get a specific field from an image in Redis
 * @param imageId - Unique identifier for the image
 * @param field - The specific field to retrieve (e.g., "status", "fileType")
 * @returns The value of the field, or null if not found
 */
export async function getImageField(imageId: string, field: string) {
	const client = await getRedisClient();
	const imageKey = `image:${imageId}`;

	// Get just the specified field
	const value = await client.hGet(imageKey, field);

	if (!value) {
		return null;
	}

	// Try to parse JSON if it looks like JSON
	try {
		return JSON.parse(value);
	} catch {
		// If it's not valid JSON, return the raw value
		return value;
	}
}

/**
 * Delete an image from Redis
 * @param imageId - Unique identifier for the image
 */
export async function deleteImage(imageId: string) {
	const client = await getRedisClient();
	const imageKey = `image:${imageId}`;

	return client.del(imageKey);
}

getRedisClient();

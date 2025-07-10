/**
 * SQLite utility for server-side operations
 * This file should only be imported in server-side code (actions, loaders)
 */
// Import the type separately from the default import
import type { Database } from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

// Set up the database file path
const DB_PATH = path.join(process.cwd(), "data.db");

// Create a singleton for the database connection
let db: Database | null = null;

/**
 * Get or create SQLite database connection
 * @returns A Promise that resolves to a Database instance
 */
async function getDatabase(): Promise<Database> {
	if (!db) {
		// Ensure the directory exists
		const dbDir = path.dirname(DB_PATH);
		if (!fs.existsSync(dbDir)) {
			fs.mkdirSync(dbDir, { recursive: true });
		}

		// Import dynamically to avoid issues with ESM/CJS
		// Use dynamic import instead of require
		const sqlite3Module = await import("better-sqlite3");
		const sqlite3 = sqlite3Module.default;
		db = new sqlite3(DB_PATH);

		// Create tables if they don't exist
		db.exec(`
			CREATE TABLE IF NOT EXISTS images (
				id TEXT PRIMARY KEY,
				data TEXT,
				status TEXT,
				fileName TEXT,
				timestamp TEXT,
				createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
				updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS metadata (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				imageId TEXT NOT NULL,
				key TEXT NOT NULL,
				value TEXT NOT NULL,
				FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE
			);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_image_key ON metadata(imageId, key);
		`);
	}

	return db;
}

/**
 * Store an image in SQLite
 * @param imageId - Unique identifier for the image
 * @param imageData - Image data as base64 string or Buffer
 * @param metadata - Optional metadata about the image
 */
export async function storeImage(
	imageId: string,
	imageData: string | Buffer | null,
	metadata: Record<string, any> = {}
) {
	const db = await getDatabase();

	// Convert Buffer to base64 string if needed
	const imageStr = Buffer.isBuffer(imageData)
		? imageData.toString("base64")
		: imageData;

	console.log(
		"storing image in SQLite with id:",
		imageId,
		", ",
		imageStr?.substring(0, 100) || "[empty]"
	);

	// Extract specific fields that are stored directly on the Image table
	const { status, fileName, timestamp, ...otherMetadata } = metadata;

	// Begin transaction
	db.exec("BEGIN TRANSACTION");

	try {
		// Check if image exists
		const existingImage = db
			.prepare("SELECT id FROM images WHERE id = ?")
			.get(imageId);

		if (existingImage) {
			// Update existing image
			db.prepare(
				`UPDATE images SET 
				data = COALESCE(?, data), 
				status = COALESCE(?, status), 
				fileName = COALESCE(?, fileName), 
				timestamp = COALESCE(?, timestamp),
				updatedAt = CURRENT_TIMESTAMP 
				WHERE id = ?`
			).run(imageStr, status, fileName, timestamp, imageId);

			// Delete existing metadata
			db.prepare("DELETE FROM metadata WHERE imageId = ?").run(imageId);
		} else {
			// Insert new image
			db.prepare(
				"INSERT INTO images (id, data, status, fileName, timestamp) VALUES (?, ?, ?, ?, ?)"
			).run(imageId, imageStr, status, fileName, timestamp);
		}

		// Store additional metadata fields
		if (Object.keys(otherMetadata).length > 0) {
			const insertMetadata = db.prepare(
				"INSERT INTO metadata (imageId, key, value) VALUES (?, ?, ?)"
			);

			for (const [key, value] of Object.entries(otherMetadata)) {
				insertMetadata.run(imageId, key, JSON.stringify(value));
			}
		}

		// Commit transaction
		db.exec("COMMIT");
	} catch (error) {
		// Rollback on error
		db.exec("ROLLBACK");
		throw error;
	}

	return `image:${imageId}`;
}

/**
 * Retrieve an image from SQLite
 * @param imageId - Unique identifier for the image
 * @returns Object containing image data and metadata, or null if not found
 */
export async function getImage(imageId: string) {
	const db = await getDatabase();

	// Define types for database results
	type ImageRecord = {
		id: string;
		data: string | null;
		status: string | null;
		fileName: string | null;
		timestamp: string | null;
		createdAt: string;
		updatedAt: string;
	};

	type MetadataRecord = {
		key: string;
		value: string;
	};

	// Get the image record
	const image = db.prepare("SELECT * FROM images WHERE id = ?").get(imageId) as ImageRecord | undefined;

	// If no data found, return null
	if (!image) {
		return null;
	}

	// Get all metadata for this image
	const metadata = db
		.prepare("SELECT key, value FROM metadata WHERE imageId = ?")
		.all(imageId) as MetadataRecord[];

	// Format the result to match Redis implementation
	const result: Record<string, any> = {
		data: image.data,
		status: image.status,
		fileName: image.fileName,
		timestamp: image.timestamp,
	};

	// Add metadata fields
	for (const meta of metadata) {
		try {
			result[meta.key] = JSON.parse(meta.value);
		} catch {
			result[meta.key] = meta.value;
		}
	}

	return result;
}

/**
 * Get a specific field from an image in SQLite
 * @param imageId - Unique identifier for the image
 * @param field - The specific field to retrieve (e.g., "status", "fileType")
 * @returns The value of the field, or null if not found
 */
export async function getImageField(imageId: string, field: string) {
	const db = await getDatabase();

	// Define type for query result
	type QueryResult = Record<string, any>;

	// Check if the field is a direct property of the Image table
	if (["data", "status", "fileName", "timestamp"].includes(field)) {
		const query = `SELECT ${field} FROM images WHERE id = ?`;
		const result = db.prepare(query).get(imageId) as QueryResult | undefined;
		return result ? result[field] : null;
	}

	// Otherwise, look in the metadata table
	const metadata = db
		.prepare("SELECT value FROM metadata WHERE imageId = ? AND key = ?")
		.get(imageId, field) as { value: string } | undefined;

	if (!metadata) {
		return null;
	}

	// Try to parse JSON if it looks like JSON
	try {
		return JSON.parse(metadata.value);
	} catch {
		// If it's not valid JSON, return the raw value
		return metadata.value;
	}
}

/**
 * Delete an image from SQLite
 * @param imageId - Unique identifier for the image
 */
export async function deleteImage(imageId: string) {
	const db = await getDatabase();

	// Begin transaction
	db.exec("BEGIN TRANSACTION");

	try {
		// Delete metadata first (though the foreign key constraint should handle this)
		db.prepare("DELETE FROM metadata WHERE imageId = ?").run(imageId);

		// Delete the image
		const result = db.prepare("DELETE FROM images WHERE id = ?").run(imageId);

		// Commit transaction
		db.exec("COMMIT");

		return result.changes; // Return number of rows affected, similar to Redis del command
	} catch (error) {
		// Rollback on error
		db.exec("ROLLBACK");
		throw error;
	}
}

// Initialize the database
(async () => {
	await getDatabase();
})().catch(err => console.error('Failed to initialize database:', err));

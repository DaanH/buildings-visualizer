// Define LoaderFunctionArgs type since it's not exported from @react-router/node
type LoaderFunctionArgs = {
	request: Request;
	params: Record<string, string>;
};

// Helper function to create JSON responses
const json = (data: any, init?: ResponseInit) => {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			...init?.headers,
			"Content-Type": "application/json",
		},
	});
};

export async function loader({ params }: LoaderFunctionArgs) {
	const imageId = params.imageId;

	if (!imageId) {
		return json({ error: "Image ID is required" }, { status: 400 });
	}

	try {
		// Import SQLite utilities only in server-side code
		const { getImageField } = await import("../../utils/sqlite.server");

		// Get the status field from SQLite
		const status = await getImageField(imageId, "status");

		if (status === null) {
			return json({ error: "Image not found" }, { status: 404 });
		}

		// If status is error, get the error message
		if (status === "error") {
			const errorMessage = await getImageField(imageId, "errorMessage");
			return json({ status, errorMessage: errorMessage || "Unknown error occurred" });
		}

		return json({ status });
	} catch (error) {
		console.error("Error fetching image status:", error);
		return json(
			{ error: "Failed to fetch image status" },
			{ status: 500 }
		);
	}
}

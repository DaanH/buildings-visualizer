import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/image-upload.tsx"),
	route("api/image/:imageId", "routes/api/image.$imageId.ts"),
	route("api/image/:imageId/status", "routes/api/image.$imageId.status.ts"),
] satisfies RouteConfig;

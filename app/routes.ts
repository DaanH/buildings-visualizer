import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("image-upload", "routes/image-upload.tsx")
] satisfies RouteConfig;

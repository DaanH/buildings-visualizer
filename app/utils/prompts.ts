export const wallMaskPrompt =
	"Using the provided image, generate a black and white segmentation mask that defines only the visible interior walls. Wall areas should be in white (255), with anti-aliasing at edges for realistic blending. All other elements — including furniture, people, pets, floors, ceilings, windows, curtains, doors, moldings, artwork, mirrors, lights, and any non-wall surfaces — should be completely black (0). This mask will be used to replace wall paint or wallpaper, so precise and accurate delineation of wall surfaces is essential.";

export const wallPrompt =
	"Edit the provided image by replacing the color of the walls with this specific color: {{color}}. Keep the rest of the image completely unchanged. The walls should be smooth and realistic. The walls should have the texture of a wallpaint. The walls should be in the same shape as the original image. Only change the color of the walls. Keep the lighting and other elements of the image unchanged. The image should be ultrarealistic photograph, matching the style of the provided image.";

// Paint colors for the color picker
export const paintColors = [
	{ name: "Arctic White", hex: "#F8F8F8" },
	{ name: "Eggshell", hex: "#F0EAD6" },
	{ name: "Cream", hex: "#FFFDD0" },
	{ name: "Beige", hex: "#F5F5DC" },
	{ name: "Light Gray", hex: "#D3D3D3" },
	{ name: "Dove Gray", hex: "#6D6D6D" },
	{ name: "Sky Blue", hex: "#87CEEB" },
	{ name: "Pale Blue", hex: "#B0E0E6" },
	{ name: "Mint Green", hex: "#98FB98" },
	{ name: "Sage", hex: "#BCB88A" },
	{ name: "Blush Pink", hex: "#FFE4E1" },
	{ name: "Lavender", hex: "#E6E6FA" },
	{ name: "Pale Yellow", hex: "#FFFFE0" },
	{ name: "Terracotta", hex: "#E2725B" },
	{ name: "Navy Blue", hex: "#000080" },
	{ name: "Forest Green", hex: "#228B22" },
	{ name: "Burgundy", hex: "#800020" },
	{ name: "Charcoal", hex: "#36454F" }
];

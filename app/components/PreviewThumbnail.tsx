import React from "react";

interface PreviewThumbnailProps {
	src: string;
	alt: string;
	title?: string;
	showCheckerboard?: boolean;
	className?: string;
	onLoad?: () => void;
}

/**
 * PreviewThumbnail component for displaying image previews with optional checkerboard background
 */
export function PreviewThumbnail({
	src,
	alt,
	title,
	showCheckerboard = false,
	className = "",
	onLoad
}: PreviewThumbnailProps) {
	return (
		<div className="mt-4">
			{title && <p className="text-sm text-gray-500 mb-2">{title}</p>}
			<div
				className={`relative w-32 h-32 overflow-hidden rounded-md border border-gray-300 ${className}`}
				style={
					showCheckerboard
						? {
								backgroundImage: `
									linear-gradient(45deg, #ccc 25%, transparent 25%), 
									linear-gradient(-45deg, #ccc 25%, transparent 25%), 
									linear-gradient(45deg, transparent 75%, #ccc 75%), 
									linear-gradient(-45deg, transparent 75%, #ccc 75%)
								`,
								backgroundSize: "10px 10px",
								backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
						  }
						: {}
				}
			>
				<img
					src={src}
					alt={alt}
					className="object-cover w-full h-full"
					onLoad={onLoad}
				/>
			</div>
		</div>
	);
}

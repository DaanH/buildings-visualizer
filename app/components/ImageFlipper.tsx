import { useCallback, useEffect, useRef, useState } from 'react';

interface ImageFlipperProps {
	image1: string;
	image2: string;
	alt1?: string;
	alt2?: string;
	className?: string;
}

export default function ImageFlipper({ image1, image2, alt1 = 'First image', alt2 = 'Second image', className = '' }: ImageFlipperProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [dividerPosition, setDividerPosition] = useState(50); // Default to middle (percentage)
	const [isDragging, setIsDragging] = useState(false);
	const [containerWidth, setContainerWidth] = useState(0);

	// Update container width on resize
	useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current) {
				setContainerWidth(containerRef.current.offsetWidth);
			}
		};

		updateDimensions();
		window.addEventListener('resize', updateDimensions);
		
		return () => {
			window.removeEventListener('resize', updateDimensions);
		};
	}, []);

	// Handle mouse down on divider
	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	// Handle mouse move for dragging
	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		if (!isDragging || !containerRef.current) return;
		
		const containerRect = containerRef.current.getBoundingClientRect();
		const x = e.clientX - containerRect.left;
		
		// Calculate position as percentage of container width
		const newPosition = Math.max(0, Math.min(100, (x / containerRect.width) * 100));
		setDividerPosition(newPosition);
	}, [isDragging]);

	// Handle touch move for mobile devices
	const handleTouchMove = useCallback((e: React.TouchEvent) => {
		if (!isDragging || !containerRef.current) return;
		
		const containerRect = containerRef.current.getBoundingClientRect();
		const x = e.touches[0].clientX - containerRect.left;
		
		// Calculate position as percentage of container width
		const newPosition = Math.max(0, Math.min(100, (x / containerRect.width) * 100));
		setDividerPosition(newPosition);
	}, [isDragging]);

	// Handle mouse up to stop dragging
	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
	}, []);

	// Add and remove global event listeners for mouse up
	useEffect(() => {
		if (isDragging) {
			document.addEventListener('mouseup', handleMouseUp);
			document.addEventListener('touchend', handleMouseUp);
		} else {
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('touchend', handleMouseUp);
		}
		
		return () => {
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('touchend', handleMouseUp);
		};
	}, [isDragging, handleMouseUp]);

	return (
		<div 
			ref={containerRef}
			className={`relative overflow-hidden ${className}`}
			style={{ 
				cursor: isDragging ? 'grabbing' : 'default',
				userSelect: 'none'
			}}
			onMouseMove={handleMouseMove}
			onTouchMove={handleTouchMove}
		>
			{/* First image (background) */}
			<div className="absolute inset-0">
				<img 
					src={image1} 
					alt={alt1} 
					className="w-full h-full object-cover"
				/>
			</div>
			
			{/* Second image (overlay) */}
			<div 
				className="absolute inset-0 overflow-hidden"
				style={{ 
					width: `${dividerPosition}%`
				}}
			>
				<img 
					src={image2} 
					alt={alt2} 
					className="w-full h-full object-cover"
					style={{
						width: containerWidth ? `${(100 / dividerPosition) * 100}%` : '100%',
						maxWidth: 'none'
					}}
				/>
			</div>
			
			{/* Divider line */}
			<div 
				className="absolute top-0 bottom-0 w-1 bg-white cursor-grab active:cursor-grabbing"
				style={{ 
					left: `calc(${dividerPosition}% - 0.5px)`,
					opacity: 0.7
				}}
				onMouseDown={handleMouseDown}
				onTouchStart={() => setIsDragging(true)}
			>
				{/* Divider handle */}
				<div 
					className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center"
				>
					<div className="w-1 h-4 bg-gray-400 rounded-full"></div>
				</div>
			</div>
		</div>
	);
}

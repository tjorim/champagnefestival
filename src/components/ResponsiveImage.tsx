import React from 'react';

interface ResponsiveImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  fill?: boolean;
}

/**
 * Responsive image component with accessibility features
 * React version of the image component with similar functionality to Next.js Image
 */
const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  src,
  alt,
  className = '',
  priority = false,
  sizes = '100vw',
  width,
  height,
  fill = false
}) => {
  // Calculate aspect ratio if both dimensions are provided
  const aspectRatio = width && height ? `${(height / width) * 100}%` : undefined;

  return (
    <div
      className={`position-relative ${className}`}
      style={fill ? { width: '100%', height: '100%' } : undefined}
    >
      {/* Aspect ratio container */}
      {aspectRatio && !fill && (
        <div style={{ paddingBottom: aspectRatio }} />
      )}

      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        sizes={sizes}
        width={width}
        height={height}
        className={`object-cover ${fill ? 'position-absolute w-100 h-100' : 'w-100'}`}
        style={{
          objectFit: 'cover',
          top: 0,
          left: 0
        }}
        onError={(e) => {
          console.error(`Failed to load image: ${src}`);
          // You might want to set a fallback image here
          e.currentTarget.src = '/images/logo.svg';
        }}
      />
    </div>
  );
};

export default ResponsiveImage;
import clsx from "clsx";
import React from "react";

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
  className = "",
  priority = false,
  sizes = "100vw",
  width,
  height,
  fill = false,
}) => {
  // Calculate aspect ratio if both dimensions are provided
  const aspectRatio = width && height ? `${(height / width) * 100}%` : undefined;

  return (
    <div
      className={`position-relative ${className}`}
      style={fill ? { width: "100%", height: "100%" } : undefined}
    >
      {aspectRatio && !fill && <div style={{ paddingBottom: aspectRatio }} aria-hidden="true" />}

      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        sizes={sizes}
        width={width}
        height={height}
        className={clsx("object-cover", fill ? "position-absolute w-100 h-100" : "w-100")}
        style={{
          objectFit: "cover",
          top: 0,
          left: 0,
        }}
        onError={(e) => {
          e.currentTarget.src = "/images/logo.svg";
          e.currentTarget.onerror = null;
        }}
      />
    </div>
  );
};

export default ResponsiveImage;

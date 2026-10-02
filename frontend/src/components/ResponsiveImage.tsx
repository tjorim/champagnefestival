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
    <div className={clsx("tw:relative", fill && "tw:h-full tw:w-full", className)}>
      {aspectRatio && !fill && (
        <div
          /* oxlint-disable shadcn/no-inline-styles -- Spacer height derives from each image's width/height props. */
          style={{ paddingBottom: aspectRatio }}
          /* oxlint-enable shadcn/no-inline-styles */
          aria-hidden="true"
        />
      )}

      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        sizes={sizes}
        width={width}
        height={height}
        className={clsx(
          "tw:top-0 tw:left-0 tw:w-full tw:object-cover",
          fill && "tw:absolute tw:h-full",
        )}
        onError={(e) => {
          e.currentTarget.src = "/images/logo.svg";
          e.currentTarget.onerror = null;
        }}
      />
    </div>
  );
};

export default ResponsiveImage;

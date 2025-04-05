'use client';

import Image from 'next/image';
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
 * Optimized responsive image component with accessibility features
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
  return (
    <div className={`position-relative ${className}`}>
      <Image
        src={src}
        alt={alt}
        priority={priority}
        sizes={sizes}
        width={width}
        height={height}
        fill={fill}
        className="object-cover"
        loading={priority ? 'eager' : 'lazy'}
      />
    </div>
  );
};

export default ResponsiveImage;
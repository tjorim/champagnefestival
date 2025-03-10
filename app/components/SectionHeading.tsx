'use client';

import React from 'react';

interface SectionHeadingProps {
  id: string;
  title: string;
  subtitle?: string;
  className?: string;
}

/**
 * Accessible section heading component with proper ARIA attributes
 */
const SectionHeading: React.FC<SectionHeadingProps> = ({ id, title, subtitle, className = '' }) => {
  return (
    <div className={`text-center ${className}`}>
      <h2 
        id={id} 
        className="section-header"
        tabIndex={-1} // Allow focus but not in tab order
      >
        {title}
      </h2>
      {subtitle && <p className="mx-auto mb-4">{subtitle}</p>}
    </div>
  );
};

export default SectionHeading;
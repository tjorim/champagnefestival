import React from 'react';

interface SectionHeadingProps {
  id: string;
  title: string;
  subtitle?: string;
  className?: string;
}

/**
 * Accessible section heading component with proper ARIA attributes
 * Used for consistent section headers across the application
 */
const SectionHeading: React.FC<SectionHeadingProps> = ({ 
  id, 
  title, 
  subtitle, 
  className = '' 
}) => {
  return (
    <div className={`text-center ${className}`}>
      <h2 
        id={id} 
        className="section-header"
        tabIndex={-1} // Allow focus but not in tab order
        aria-label={subtitle ? `${title} - ${subtitle}` : title}
      >
        {title}
      </h2>
      {subtitle && (
        <p 
          className="mx-auto mb-4"
          id={`${id}-subtitle`}
          aria-describedby={id}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default SectionHeading;
import React from 'react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface SectionHeadingProps {
  id: string;
  titleKey: string; // Changed from title
  fallbackTitle: string; // Added fallback
  subtitleKey?: string; // Optional subtitle key
  fallbackSubtitle?: string; // Optional fallback subtitle
  className?: string;
}

/**
 * Accessible section heading component with proper ARIA attributes and i18n support
 * Used for consistent section headers across the application
 */
const SectionHeading: React.FC<SectionHeadingProps> = ({
  id,
  titleKey,
  fallbackTitle,
  subtitleKey,
  fallbackSubtitle,
  className = ''
}) => {
  const { t } = useTranslation(); // Use the hook
  const title = t(titleKey, fallbackTitle); // Translate title
  const subtitle = subtitleKey ? t(subtitleKey, fallbackSubtitle ?? '') : undefined; // Translate subtitle if key exists

  return (
    <div className={`text-center ${className}`}>
      <h2
        id={id}
        className="section-header"
        tabIndex={-1} // Allow focus but not in tab order
        aria-label={subtitle ? `${title} - ${subtitle}` : title}
        aria-describedby={subtitle ? `${id}-subtitle` : undefined}
      >
        {title} {/* Render translated title */}
      </h2>
      {subtitle && (
        <p
          className="mx-auto mb-4"
          id={`${id}-subtitle`}
        >
          {subtitle} {/* Render translated subtitle */}
        </p>
      )}
    </div>
  );
};

export default SectionHeading;
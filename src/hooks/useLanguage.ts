import { useEffect } from 'react';
import { UseTranslationResponse } from 'react-i18next';

/**
 * Custom hook to handle language settings and HTML attributes
 * Features:
 * - Updates HTML lang attribute dynamically based on current language
 * - Manages URL parameters for language persistence
 * - Handles default language (Dutch) without URL parameters
 * 
 * @param i18n The i18n instance from useTranslation
 * @param defaultLanguage The default language code (defaults to 'nl')
 */
export function useLanguage(
  i18n: UseTranslationResponse<string, string>['i18n'],
  defaultLanguage: string = 'nl'
) {
  useEffect(() => {
    // Get base language code
    const baseLanguage = i18n.language.split('-')[0];

    // Set HTML lang attribute for SEO
    document.documentElement.lang = baseLanguage;

    // Update URL with language parameter without page reload
    try {
      const url = new URL(window.location.href);
      const currentLng = url.searchParams.get('lng');

      // Always use base language code for URL
      if (baseLanguage !== defaultLanguage && baseLanguage !== currentLng) {
        // Only update URL for non-default languages
        url.searchParams.set('lng', baseLanguage);
        window.history.replaceState({}, '', url.toString());
      } else if (currentLng && baseLanguage === defaultLanguage) {
        // Remove parameter for default language
        url.searchParams.delete('lng');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (error) {
      console.error('Error updating language in URL:', error);
    }
    // No cleanup function needed for this effect as it only manipulates
    // the DOM and browser history state directly without setting up
    // subscriptions or timers.
  }, [i18n.language, defaultLanguage]);
}
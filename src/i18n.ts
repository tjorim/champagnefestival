import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Dictionary } from './types/i18n';

// Import translations
import enTranslation from "./translations/en.json";
import nlTranslation from './translations/nl.json';
import frTranslation from './translations/fr.json';

// Supported languages constant (alphabetical order)
export const SUPPORTED_LANGUAGES = ['en', 'fr', 'nl'] as const;

// Define resources with type safety
const resources = {
    en: { translation: enTranslation as Dictionary },
    fr: { translation: frTranslation as Dictionary },
    nl: { translation: nlTranslation as Dictionary },
} satisfies Record<typeof SUPPORTED_LANGUAGES[number], { translation: Dictionary }>;

// Create a language detector that normalizes language codes and implements the i18next interface
const normalizedLanguageDetector: import('i18next').LanguageDetectorModule = {
    type: 'languageDetector',
    init: () => { },
    detect: () => {
        // First check URL parameter for language
        const urlParams = new URLSearchParams(window.location.search);
        const urlLanguage = urlParams.get('lng');
        if (urlLanguage && (SUPPORTED_LANGUAGES as readonly string[]).includes(urlLanguage)) {
            return urlLanguage;
        }
        
        // Then check localStorage for saved language preference
        const savedLanguage = localStorage.getItem('i18nextLng');
        if (savedLanguage && (SUPPORTED_LANGUAGES as readonly string[]).includes(savedLanguage)) {
            return savedLanguage;
        }
        
        // Get browser language
        const browserLang = navigator.language || (navigator as Navigator & { userLanguage?: string }).userLanguage || '';
        // Support languages
        const supportedLanguages = SUPPORTED_LANGUAGES as readonly string[];
        // Default language
        const defaultLanguage = 'nl';
        // Ensure we have a valid string to work with
        if (!browserLang || typeof browserLang !== 'string') {
            return defaultLanguage;
        }
        // Extract the base language code
        const baseLang = browserLang.split('-')[0].toLowerCase();
        // Verify we have a non-empty string after normalization
        if (!baseLang) {
            return defaultLanguage;
        }
        // Check if it's a supported language
        if (supportedLanguages.includes(baseLang)) {
            return baseLang;
        }
        // Default to Dutch if no match is found
        return defaultLanguage;
    },
    cacheUserLanguage: (lng: string) => {
        // Save language preference to localStorage
        localStorage.setItem('i18nextLng', lng);
    }
};

i18n
    // Use the custom language detector only
    .use(normalizedLanguageDetector)
    // pass the i18n instance to react-i18next
    .use(initReactI18next)
    // init i18next
    .init({
        resources: resources,
        fallbackLng: 'nl', // Dutch is the most common
        supportedLngs: SUPPORTED_LANGUAGES,
        load: 'languageOnly', // Reduce language codes like 'en-US' to just 'en'
    });

// Type augmentation for useTranslation hook
declare module 'react-i18next' {
    interface CustomTypeOptions {
        defaultNS: 'translation';
        resources: {
            translation: Dictionary;
        };
    }
}

export default i18n;
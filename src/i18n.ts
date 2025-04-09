import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { Dictionary } from './types/i18n';
import { festivalDateRange } from './config/dates';

// Import translations
import enTranslation from "./translations/en.json";
import nlTranslation from './translations/nl.json';
import frTranslation from './translations/fr.json';

// Update festival dates in translations
function updateFestivalDates(resources: Record<string, { translation: Dictionary }>) {
    Object.entries(resources).forEach(([lang, { translation }]) => {
        if (translation.faq?.a2) {
            translation.faq.a2 = translation.faq.a2.replace(
                /{festivalDateRange}/g,
                festivalDateRange[lang as keyof typeof festivalDateRange] || festivalDateRange.en
            );
        }
    });
    return resources;
}

// Define resources with type safety
const resources: Record<string, { translation: Dictionary }> = {
    en: { translation: enTranslation as Dictionary },
    nl: { translation: nlTranslation as Dictionary },
    fr: { translation: frTranslation as Dictionary },
};

// Update festival dates in all translations
const updatedResources = updateFestivalDates(resources);

// Create a language detector that normalizes language codes
const normalizedLanguageDetector = {
    name: 'normalized',
    lookup: () => {
        // Get browser language
        const browserLang = navigator.language || (navigator as any).userLanguage || '';
        
        // Extract the base language code
        const baseLang = browserLang.split('-')[0].toLowerCase();
        
        // Check if it's a supported language
        if (['en', 'fr', 'nl'].includes(baseLang)) {
            return baseLang;
        }
        
        // Default to Dutch
        return 'nl';
    }
};

i18n
    // First add our custom language detector
    .use({
        type: 'languageDetector',
        init: () => {},
        detect: () => normalizedLanguageDetector.lookup(),
        cacheUserLanguage: () => {}
    } as any)
    // Then the standard detector as fallback
    .use(LanguageDetector)
    // pass the i18n instance to react-i18next
    .use(initReactI18next)
    // init i18next
    .init({
        resources: updatedResources,
        fallbackLng: 'nl',
        supportedLngs: ['nl', 'fr', 'en'], // Add list of supported languages
        load: 'languageOnly', // Reduce language codes like 'en-US' to just 'en'
        detection: {
            // Try to detect locale from different sources in order
            order: ['querystring', 'navigator', 'htmlTag', 'localStorage'],
            // Look for ?lng= parameter in URL
            lookupQuerystring: 'lng',
            // Store user language preference
            caches: ['localStorage']
        }
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
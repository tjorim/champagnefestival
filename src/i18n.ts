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

i18n
    // detect user language
    .use(LanguageDetector)
    // pass the i18n instance to react-i18next
    .use(initReactI18next)
    // init i18next
    .init({
        resources: updatedResources,
        lng: 'nl', // default language
        fallbackLng: 'nl',
        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        },
        debug: process.env.NODE_ENV === 'development'
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
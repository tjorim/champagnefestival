import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from "./translations/en.json";
import nlTranslation from './translations/nl.json';
import frTranslation from './translations/fr.json';

i18n
    // detect user language
    .use(LanguageDetector)
    // pass the i18n instance to react-i18next
    .use(initReactI18next)
    // init i18next
    .init({
        resources: {
            en: { translation: enTranslation },
            nl: { translation: nlTranslation },
            fr: { translation: frTranslation },
        },
        lng: 'nl', // default language
        fallbackLng: 'nl',
        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        },
        debug: process.env.NODE_ENV === 'development'
    });

export default i18n;
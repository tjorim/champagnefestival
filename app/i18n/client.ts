'use client';

import i18next from 'i18next';
import { initReactI18next, useTranslation as useTranslationOrg } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { getOptions } from './settings';

// Initialize i18next for client-side only
i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .use(resourcesToBackend((language: string) => import(`../../dictionaries/${language}.json`)))
  .init({
    ...getOptions(),
    detection: {
      order: ['path', 'cookie', 'navigator'],
    }
  });

export function useTranslation(lng: string, ns?: string, options = {}) {
  const ret = useTranslationOrg(ns, options);
  const { i18n } = ret;
  
  // Change language if needed
  if (i18n.resolvedLanguage !== lng) {
    i18n.changeLanguage(lng);
  }
  
  return ret;
}
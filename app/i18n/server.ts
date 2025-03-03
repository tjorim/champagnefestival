import { createInstance, i18n } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next/initReactI18next';
import { getOptions } from './settings';

// Server-side i18n instance
const initI18next = async (lng: string, ns?: string): Promise<i18n> => {
  const i18nInstance = createInstance();
  await i18nInstance
    .use(initReactI18next)
    .use(resourcesToBackend((language: string) => import(`../../dictionaries/${language}.json`)))
    .init(getOptions(lng, ns));

  return i18nInstance;
};

// Translation function for server components
export async function getTranslation(lng: string, ns?: string, options = {}) {
  const i18nextInstance = await initI18next(lng, ns);
  return {
    // Server-side t function
    t: i18nextInstance.getFixedT(lng, ns, options),
    i18n: i18nextInstance
  };
}
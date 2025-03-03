import 'server-only';

// Type for the dictionaries
type Dictionary = Record<string, any>;

// Import dictionaries using dynamic imports
const dictionaries: Record<string, () => Promise<Dictionary>> = {
  en: () => import('../dictionaries/en.json').then((module) => module.default),
  fr: () => import('../dictionaries/fr.json').then((module) => module.default),
  nl: () => import('../dictionaries/nl.json').then((module) => module.default),
};

// Function to get a dictionary for a specific locale
export const getDictionary = async (locale: string = 'nl'): Promise<Dictionary> => {
  // Default to 'nl' if the requested locale is not available
  const requestedDictionary = dictionaries[locale] || dictionaries.nl;
  return requestedDictionary();
};
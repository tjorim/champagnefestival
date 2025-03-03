import 'server-only';

// Strongly typed dictionary structure based on our English translations
export interface Dictionary {
  welcome: {
    title: string;
    subtitle: string;
    learnMore: string;
  };
  whatWeDo: {
    title: string;
    description: string;
    forEveryone: string;
    feature1: {
      title: string;
      description: string;
    };
    feature2: {
      title: string;
      description: string;
    };
    feature3: {
      title: string;
      description: string;
    };
  };
  nextFestival: {
    title: string;
    description: string;
  };
  schedule: {
    title: string;
    description: string;
  };
  location: {
    title: string;
    venueName: string;
    venueDescription: string;
    address: string;
    addressValue: string;
    openingHours: string;
    openingHoursValue: string;
  };
  countdown: {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
    started: string;
    loading: string;
  };
  producers: {
    title: string;
  };
  sponsors: {
    title: string;
  };
  faq: {
    title: string;
    q1: string;
    a1: string;
    q2: string;
    a2: string;
    q3: string;
    a3: string;
    q4: string;
    a4: string;
    q5: string;
    a5: string;
  };
  contact: {
    title: string;
    intro: string;
    alternativeContact: string;
    emailLabel: string;
    emailValue: string;
    phoneLabel: string;
    phoneValue: string;
    name: string;
    email: string;
    message: string;
    placeholderMessage: string;
    submitting: string;
    submit: string;
    successMessage: string;
    submissionError: string;
    errors: {
      nameRequired: string;
      emailRequired: string;
      emailInvalid: string;
      messageRequired: string;
    };
  };
  accessibility: {
    skipToContent: string;
  };
  festivalName: string;
  loading: string;
  loadingBackground: string;
  error: string;
  footer: {
    rights: string;
    privacy: string;
    terms: string;
  };
  language: {
    select: string;
  };
  close: string;
  privacy: {
    title: string;
    lastUpdated: string;
    lastUpdatedDate: string;
    intro: string;
    dataCollection: {
      title: string;
      content: string;
    };
    dataUse: {
      title: string;
      content: string;
    };
    dataProtection: {
      title: string;
      content: string;
    };
    cookies: {
      title: string;
      content: string;
    };
    contactUs: {
      title: string;
      content: string;
    };
  };
}

// Define supported languages
export const languages = ['en', 'fr', 'nl'];
export const defaultLanguage = 'nl';

// Import dictionaries using dynamic imports
const dictionaries: Record<string, () => Promise<Dictionary>> = {
  en: () => import('@/dictionaries/en.json').then((module) => module.default),
  fr: () => import('@/dictionaries/fr.json').then((module) => module.default),
  nl: () => import('@/dictionaries/nl.json').then((module) => module.default),
};

/**
 * Get a dictionary for a specific locale
 * @param locale - The locale to get the dictionary for
 * @returns The dictionary for the requested locale
 */
export const getDictionary = async (locale: string = defaultLanguage): Promise<Dictionary> => {
  // Default to defaultLanguage if the requested locale is not available
  const requestedDictionary = dictionaries[locale] || dictionaries[defaultLanguage];
  return requestedDictionary();
};
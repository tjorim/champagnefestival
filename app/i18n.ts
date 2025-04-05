import {getRequestConfig} from 'next-intl/server';
import {languages, defaultLanguage} from '@/lib/i18n';
 
export default getRequestConfig(async ({locale}) => {
  // Validate that the incoming locale is supported
  if (!languages.includes(locale as string)) {
    locale = defaultLanguage;
  }
  
  // Import the dictionary dynamically based on locale
  const messages = (await import(`@/dictionaries/${locale}.json`)).default;
  
  return {
    messages
  };
});
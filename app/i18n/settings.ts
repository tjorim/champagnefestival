export const fallbackLng = 'nl';
export const languages = ['en', 'fr', 'nl'];
export const defaultNS = 'translation';

export function getOptions(lng = fallbackLng, ns = defaultNS) {
  return {
    // Debug mode
    debug: process.env.NODE_ENV === 'development',
    
    // Supported languages
    supportedLngs: languages,
    
    // Default fallback language
    fallbackLng,
    
    // Default namespace
    defaultNS,
    
    // Custom namespace
    ns,
    
    // Namespace to use
    lng,
    
    // Disable suspense mode
    react: { useSuspense: false }
  };
}
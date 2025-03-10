import createMiddleware from 'next-intl/middleware';
import { languages, defaultLanguage } from './lib/i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales: languages,
  
  // If a user tries to access a page with a locale that is not supported, they will be redirected to defaultLocale
  defaultLocale: defaultLanguage,
  
  // The default locale will be used when no locale matches
  localePrefix: 'as-needed',
  
  // For prefixing the default locale, we can use 'always' instead of 'as-needed'
  localeDetection: true
});

export const config = {
  // Match all pathnames except for
  // - ... for files in the public folder (e.g. /favicon.ico)
  matcher: ['/((?!api|_next|.*\\..*).*)']
};
import { createSharedPathnamesNavigation } from 'next-intl/navigation';
import { languages, defaultLanguage } from './lib/i18n';

export const { Link, redirect, usePathname, useRouter } = createSharedPathnamesNavigation({ 
  locales: languages,
  defaultLocale: defaultLanguage 
});
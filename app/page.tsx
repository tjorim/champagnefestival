import { redirect } from 'next/navigation';
import { defaultLanguage } from '@/lib/i18n';

/**
 * A React component that immediately redirects users to the default language route.
 *
 * Upon rendering, this component navigates to a URL formatted with the default language,
 * bypassing any UI rendering. It is used as the root page to automatically direct users
 * to the localized version of the site.
 *
 * @example
 * // With defaultLanguage set to "en", accessing this page redirects to "/en".
 */
export default function Home() {
  redirect(`/${defaultLanguage}`);
}
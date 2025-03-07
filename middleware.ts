import { NextRequest, NextResponse } from 'next/server';
import { languages, defaultLanguage } from './lib/i18n';

// Use the languages and defaultLanguage from lib/i18n.ts
const locales = languages;
const defaultLocale = defaultLanguage;

/**
 * Determines and returns the locale for a given Next.js request.
 *
 * The function first checks for a valid locale in the 'NEXT_LOCALE' cookie. If the cookie is absent or invalid,
 * it parses the 'accept-language' header to extract the client's preferred languages and returns the first matching
 * supported locale. If no match is found, the default locale is returned.
 *
 * @param request - The Next.js request object containing cookies and headers.
 * @returns The selected locale as a string.
 */
function getLocale(request: NextRequest): string {
  // Check if locale is in cookie
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale && locales.includes(cookieLocale)) {
    return cookieLocale;
  }

  // Check if locale is in accept-language header
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    const preferredLanguages = acceptLanguage
      .split(',')
      .map(lang => lang.split(';')[0].trim().split('-')[0].toLowerCase());
    
    for (const lang of preferredLanguages) {
      if (locales.includes(lang)) {
        return lang;
      }
    }
  }

  // Default locale
  return defaultLocale;
}

/**
 * Redirects an incoming request to a locale-specific URL if the pathname does not already include a supported locale.
 *
 * The middleware checks if the request's pathname begins with a locale (e.g., "/en", "/fr"). If not, it
 * determines the appropriate locale using `getLocale`, prepends the locale to the pathname, and returns a
 * redirect response to the updated URL. If the pathname already contains a valid locale, no redirection occurs.
 *
 * @returns A redirect response with the locale-prefixed URL if redirection is applied, or undefined otherwise.
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if the pathname already has a locale
  const pathnameHasLocale = locales.some(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) return;

  // Redirect to locale-prefixed URL
  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: [
    // Skip all internal paths (_next, assets, api)
    '/((?!_next|images|favicon.ico|api).*)',
  ],
};
import { NextRequest, NextResponse } from 'next/server';
import { languages, defaultLanguage } from './get-dictionary';

// Use the languages and defaultLanguage from get-dictionary.ts
const locales = languages;
const defaultLocale = defaultLanguage;

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
      .map(lang => lang.split(';')[0].trim().substring(0, 2).toLowerCase());
    
    for (const lang of preferredLanguages) {
      if (locales.includes(lang)) {
        return lang;
      }
    }
  }

  // Default locale
  return defaultLocale;
}

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
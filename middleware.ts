import createMiddleware from 'next-intl/middleware';
import { languages, defaultLanguage } from './lib/i18n';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Create the next-intl middleware
const intlMiddleware = createMiddleware({
  // A list of all locales that are supported
  locales: languages,
  
  // If a user tries to access a page with a locale that is not supported, they will be redirected to defaultLocale
  defaultLocale: defaultLanguage,
  
  // Use always to ensure all URLs have a locale prefix for better compatibility
  localePrefix: 'always',
  
  // Enable automatic locale detection
  localeDetection: true
});

// Export a middleware handler that first redirects the root and then applies the intl middleware
export default function middleware(request: NextRequest) {
  try {
    const url = request.nextUrl.clone();
    const pathname = url.pathname;
    
    // Handle the root path and redirect to default locale
    if (pathname === '/') {
      url.pathname = `/${defaultLanguage}`;
      return NextResponse.redirect(url);
    }
    
    // Debug route to check middleware functionality
    if (pathname === '/debug-middleware') {
      return NextResponse.json({
        message: 'Middleware is working properly',
        url: request.url,
        nextUrl: request.nextUrl.toString(),
        pathname,
        defaultLocale: defaultLanguage,
        locales: languages,
      });
    }
    
    // For all other paths, use the intl middleware
    return intlMiddleware(request);
  } catch (error) {
    console.error('Middleware error:', error);
    // Return an error response with details
    return NextResponse.json(
      { 
        error: 'Middleware Error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export const config = {
  // Match all pathnames except for
  // - ... for files in the public folder (e.g. /favicon.ico)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
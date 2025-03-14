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
    
    // Skip middleware for test pages to bypass internationalization
    if (
      pathname === '/minimal-test' || 
      pathname === '/barebone' || 
      pathname.startsWith('/api/debug') || 
      pathname.startsWith('/api/basic')
    ) {
      return NextResponse.next();
    }
    
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
        timestamp: new Date().toISOString(),
      });
    }
    
    // For specific debug paths, just continue to the next middleware
    if (pathname === '/api/debug') {
      return NextResponse.next();
    }
    
    // For all other paths, use the intl middleware
    try {
      return intlMiddleware(request);
    } catch (intlError) {
      console.error('Intl middleware error:', intlError);
      return NextResponse.json(
        { 
          error: 'Intl Middleware Error', 
          message: intlError instanceof Error ? intlError.message : 'Unknown error in intl middleware',
          stack: intlError instanceof Error ? intlError.stack : undefined,
          url: request.url,
          pathname,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Middleware error:', error);
    // Return an error response with details
    return NextResponse.json(
      { 
        error: 'Middleware Error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        url: request.url,
        pathname: request.nextUrl.pathname,
      },
      { status: 500 }
    );
  }
}

export const config = {
  // Match specific routes rather than excluding patterns
  // This makes the middleware more predictable and easier to debug
  matcher: [
    // Root path
    '/',
    // Locale paths
    '/:locale(en|fr|nl)/:path*',
    // Only specific API routes
    '/api/contact/:path*',
    // Debug paths
    '/debug-middleware',
  ]
};
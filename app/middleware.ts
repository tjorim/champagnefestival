import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Intercepts incoming requests and passes control to the next handler.
 *
 * This middleware is invoked for each request and currently returns the unmodified response,
 * allowing the request to continue through the processing pipeline. It provides a hook for
 * implementing custom request handling, such as URL rewrites, redirects, or header modifications.
 *
 * @param request - The incoming Next.js request object.
 * @returns A response that allows further processing of the request.
 */
export function middleware(request: NextRequest) {
  // You can perform redirects, rewrite URLs, or modify the response headers here
  return NextResponse.next();
}

// Configure which paths this middleware will run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (static image files)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|images|public).*)',
  ],
};
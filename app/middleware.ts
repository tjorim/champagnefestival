import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This middleware function runs before each request is processed
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
import { NextResponse } from 'next/server';

// Enable Edge Runtime for Cloudflare Pages
export const runtime = 'edge';

export function GET() {
  return NextResponse.json({ 
    message: 'Basic API is working',
    timestamp: new Date().toISOString() 
  });
}
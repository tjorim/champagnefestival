import { NextResponse } from 'next/server';

// Enable Edge Runtime for Cloudflare Pages
export const runtime = 'edge';

// This endpoint can be accessed directly to check if Edge Runtime is working
export async function GET() {
  try {
    const data = {
      timestamp: new Date().toISOString(),
      env: {
        node_version: process?.versions?.node || 'undefined',
        node_env: process?.env?.NODE_ENV || 'undefined',
        runtime: typeof process !== 'undefined' ? 'node' : 'edge',
      },
      headers: Object.fromEntries(new Headers().entries()),
    };

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Debug API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Debug Error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
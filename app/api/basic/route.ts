import { NextResponse } from 'next/server';

// No runtime declaration

export function GET() {
  return NextResponse.json({ 
    message: 'Basic API is working',
    timestamp: new Date().toISOString() 
  });
}
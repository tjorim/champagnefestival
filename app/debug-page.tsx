'use client';

export const runtime = 'edge';

import Link from 'next/link';

export default function DebugPage() {
  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>Debug Page</h1>
      <p>If you can see this page, basic Edge runtime functionality is working.</p>
      
      <h2>Runtime Information:</h2>
      <pre style={{ background: '#f0f0f0', padding: '10px', overflow: 'auto' }}>
        {JSON.stringify(
          {
            runtime: typeof window !== 'undefined' ? 'client' : 'server',
            nodeVersion: process?.versions?.node || 'undefined',
            v8Version: process?.versions?.v8 || 'undefined',
          },
          null,
          2
        )}
      </pre>
      
      <h2>Links to Test:</h2>
      <ul>
        <li><Link href="/nl">Dutch Home</Link></li>
        <li><Link href="/en">English Home</Link></li>
        <li><Link href="/fr">French Home</Link></li>
        <li><Link href="/api/contact">API (should return 405 Method Not Allowed)</Link></li>
      </ul>
    </div>
  );
}
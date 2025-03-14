'use client';

export const runtime = 'edge';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link href="/nl">Go to Homepage</Link>
      <div style={{ marginTop: '20px' }}>
        <Link href="/debug-page">Go to Debug Page</Link>
      </div>
    </div>
  );
}
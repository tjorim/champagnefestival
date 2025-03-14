'use client';

// Enable Edge Runtime for Cloudflare Pages
export const runtime = 'edge';

export default function Barebone() {
  return (
    <div>
      <h1>Barebone Page</h1>
      <p>Basic test with no extra configuration</p>
    </div>
  );
}
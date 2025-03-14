'use client';

export const runtime = 'edge';

export default function MinimalTest() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Minimal Test Page</h1>
      <p>This is a minimal test page to check Edge Runtime functionality.</p>
      <pre>
        {JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            runtime: typeof window !== 'undefined' ? 'client' : 'server',
          },
          null,
          2
        )}
      </pre>
    </div>
  );
}
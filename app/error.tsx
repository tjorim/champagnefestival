'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Runtime error:', error);
  }, [error]);

  return (
    <div className="container text-center py-5">
      <h1>Something went wrong!</h1>
      <div className="alert alert-danger my-4">
        <p className="mb-0">Error: {error.message}</p>
        {error.stack && (
          <pre className="mt-3 text-start overflow-auto" style={{ maxHeight: '200px' }}>
            {error.stack}
          </pre>
        )}
        {error.digest && <p className="mt-2">Digest: {error.digest}</p>}
      </div>
      <button
        className="btn btn-primary"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
import React, { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

interface SuspenseWithBoundaryProps {
  fallback: React.ReactNode;
  errorFallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Combines ErrorBoundary and Suspense into a single reusable component.
 * Use this wrapper for all lazy-loaded components to prevent uncaught errors
 * from crashing the whole page.
 *
 * @param fallback - Content shown while the lazy component is loading
 * @param errorFallback - Content shown if the component throws an error (omit for decorative components)
 * @param children - The lazy-loaded component(s) to wrap
 */
function SuspenseWithBoundary({ fallback, errorFallback, children }: SuspenseWithBoundaryProps) {
  return (
    <ErrorBoundary fallback={errorFallback != null ? <>{errorFallback}</> : <></>}>
      <Suspense fallback={fallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export default SuspenseWithBoundary;

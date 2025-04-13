import React, { lazy, Suspense, ComponentType } from 'react';
import Spinner from 'react-bootstrap/Spinner';

/**
 * Custom hook to standardize lazy loading of components with suspense
 * Features:
 * - Wraps React.lazy with Suspense for consistent loading behavior
 * - Provides standardized loading indicator
 * - Supports custom loading component if needed
 * 
 * @param importFn Function that imports the component
 * @param loadingFallback Custom fallback component (optional)
 * @returns A component wrapped with Suspense
 */
export function useLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  loadingText: string = 'Loading...',
  customFallback?: React.ReactNode
): React.FC<React.ComponentProps<T>> {
  const LazyComponent = lazy(importFn);
  
  // Default fallback with spinner
  const defaultFallback = (
    <div className="d-flex align-items-center justify-content-center py-3">
      <div className="text-center">
        <Spinner animation="border" variant="primary" className="mb-2" aria-hidden="true" />
        <p className="mb-0">{loadingText}</p>
      </div>
    </div>
  );
  
  // Return component with proper suspense wrapping
  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={customFallback || defaultFallback}>
      <LazyComponent {...props} />
    </Suspense>
  );
}
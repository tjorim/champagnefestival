import { useEffect } from 'react';

/**
 * Custom hook to register a service worker for PWA capabilities
 * Features:
 * - Only registers in production environment
 * - Handles service worker registration on load
 * - Provides error handling and logging
 * - Detects and notifies about service worker updates
 * 
 * @param swPath Path to the service worker file (defaults to '/sw.js')
 */
export function useServiceWorker(swPath: string = '/sw.js') {
  useEffect(() => {
    // Only register in production and if service workers are supported
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      const registerSW = () => {
        navigator.serviceWorker.register(swPath)
          .then(registration => {
            console.warn('Service Worker registered with scope:', registration.scope);

            // Handle service worker updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New content is available, notify user
                    console.warn('New content is available; please refresh.');
                    // TODO: Dispatch an event here to show a notification/toast to the user
                    // Example: document.dispatchEvent(new CustomEvent('swUpdate', { detail: registration }));
                  }
                });
              }
            });
          })
          .catch(error => {
            console.warn('Service Worker registration failed:', error);
          });
      };

      // Register when the window has loaded
      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
        // Clean up
        return () => {
          window.removeEventListener('load', registerSW);
        };
      }
    }
  }, [swPath]);
}
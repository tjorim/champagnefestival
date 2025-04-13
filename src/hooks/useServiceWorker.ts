import { useEffect } from 'react';

/**
 * Custom hook to register a service worker for PWA capabilities
 * Features:
 * - Only registers in production environment
 * - Handles service worker registration on load
 * - Provides error handling and logging
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
            console.log('Service Worker registered with scope:', registration.scope);
          })
          .catch(error => {
            console.error('Service Worker registration failed:', error);
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
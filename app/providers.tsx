'use client';

import { useEffect } from 'react';
import { SSRProvider } from 'react-bootstrap';
import { I18nextProvider } from 'react-i18next';
import initI18n from './i18n';

export function Providers({ children }: { children: React.ReactNode }) {
  const i18n = initI18n();

  // Initialize client-side Bootstrap JS
  useEffect(() => {
    // This is only needed if you're using Bootstrap JS components like dropdowns
    import('bootstrap/dist/js/bootstrap.bundle.min.js');
  }, []);

  return (
    <SSRProvider>
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </SSRProvider>
  );
}
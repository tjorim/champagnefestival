import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useServiceWorker } from '@/hooks/useServiceWorker';

describe('useServiceWorker hook', () => {
  it('does not register service worker in non-production environment', () => {
    // import.meta.env.PROD is false by default in tests
    const registerMock = vi.fn();
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    const hadServiceWorker = Object.prototype.hasOwnProperty.call(navigator, 'serviceWorker');

    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: registerMock },
        configurable: true,
      });

      renderHook(() => useServiceWorker());
      // Should NOT be called because PROD is false in test environment
      expect(registerMock).not.toHaveBeenCalled();
    } finally {
      if (hadServiceWorker && originalDescriptor) {
        Object.defineProperty(navigator, 'serviceWorker', originalDescriptor);
      } else {
        delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      }
    }
  });

  it('mounts without throwing an error', () => {
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });

  it('mounts without throwing when serviceWorker is not supported', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    const hadServiceWorker = Object.prototype.hasOwnProperty.call(navigator, 'serviceWorker');

    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        configurable: true,
      });

      expect(() => renderHook(() => useServiceWorker())).not.toThrow();
    } finally {
      if (hadServiceWorker && originalDescriptor) {
        Object.defineProperty(navigator, 'serviceWorker', originalDescriptor);
      } else {
        delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      }
    }
  });

  it('accepts a custom service worker path', () => {
    expect(() => renderHook(() => useServiceWorker('/custom-sw.js'))).not.toThrow();
  });
});

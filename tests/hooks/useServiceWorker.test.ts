import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useServiceWorker } from '@/hooks/useServiceWorker';

describe('useServiceWorker hook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not register service worker in non-production environment', () => {
    // import.meta.env.PROD is false by default in tests
    const registerMock = vi.fn();
    const originalSW = (navigator as Navigator & { serviceWorker?: unknown }).serviceWorker;

    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: registerMock },
        configurable: true,
      });

      renderHook(() => useServiceWorker());
      // Should NOT be called because PROD is false in test environment
      expect(registerMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalSW,
        configurable: true,
      });
    }
  });

  it('mounts without throwing an error', () => {
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });

  it('mounts without throwing when serviceWorker is not supported', () => {
    const originalSW = (navigator as Navigator & { serviceWorker?: unknown }).serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
    });
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalSW,
      configurable: true,
    });
  });

  it('accepts a custom service worker path', () => {
    expect(() => renderHook(() => useServiceWorker('/custom-sw.js'))).not.toThrow();
  });
});

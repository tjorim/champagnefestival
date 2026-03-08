import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useLanguage } from '@/hooks/useLanguage';

vi.mock('@/paraglide/runtime', () => ({
  getLocale: vi.fn().mockReturnValue('nl'),
  setLocale: vi.fn(),
  isLocale: vi.fn().mockReturnValue(true),
}));

describe('useLanguage hook', () => {
  it('sets the document language attribute on mount', () => {
    renderHook(() => useLanguage());
    expect(document.documentElement.lang).toBe('nl');
  });

  it('uses the locale from getLocale', async () => {
    const { getLocale } = await import('@/paraglide/runtime');
    vi.mocked(getLocale).mockReturnValue('en');
    renderHook(() => useLanguage());
    expect(document.documentElement.lang).toBe('en');
  });
});

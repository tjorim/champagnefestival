import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScrollNavigation } from '@/hooks/useScrollNavigation';

// ResizeObserver must be a proper constructor function (not arrow function)
const MockResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', MockResizeObserver);

describe('useScrollNavigation hook', () => {
  beforeEach(() => {
    MockResizeObserver.mockClear();
    // Reset hash to empty with complete Location-like object
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        hash: '',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
        origin: 'http://localhost',
        protocol: 'http:',
        host: 'localhost',
        hostname: 'localhost',
        port: '',
      },
    });
  });

  it('mounts without errors', () => {
    expect(() => renderHook(() => useScrollNavigation())).not.toThrow();
  });

  it('adds scroll event listener on mount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useScrollNavigation());
    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('removes scroll event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useScrollNavigation());
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('adds hashchange event listener on mount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useScrollNavigation());
    expect(addEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
  });

  it('removes hashchange event listener on unmount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useScrollNavigation());
    const hashchangeHandler = addEventListenerSpy.mock.calls
      .filter(([eventName]) => eventName === 'hashchange')
      .at(-1)?.[1];

    unmount();

    expect(hashchangeHandler).toBeDefined();
    const removedHashchangeCall = removeEventListenerSpy.mock.calls.find(
      ([eventName, handler]) => eventName === 'hashchange' && handler === hashchangeHandler
    );
    expect(removedHashchangeCall).toBeDefined();
  });

  it('handles initial hash without throwing', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        hash: '#about',
        pathname: '/',
        search: '',
        href: 'http://localhost/#about',
        origin: 'http://localhost',
        protocol: 'http:',
        host: 'localhost',
        hostname: 'localhost',
        port: '',
      },
    });
    // Just verify hook mounts without error when there's a hash but no matching element
    expect(() => renderHook(() => useScrollNavigation())).not.toThrow();
  });
});

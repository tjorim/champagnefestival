import '@testing-library/jest-dom';
import { vi } from 'vitest';


// Mock objects that are not available in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => { },
    removeListener: () => { },
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => { },
  }),
});

// Mock leaflet since it doesn't work well in jsdom
vi.mock('leaflet', () => ({
  icon: vi.fn().mockReturnValue({}),
  latLng: vi.fn().mockReturnValue({}),
  map: vi.fn().mockReturnValue({
    setView: vi.fn(),
    removeControl: vi.fn(),
    addControl: vi.fn(),
    addLayer: vi.fn(),
  }),
  marker: vi.fn().mockReturnValue({
    addTo: vi.fn().mockReturnValue({
      bindPopup: vi.fn().mockReturnValue({
        openPopup: vi.fn(),
      }),
    }),
  }),
  tileLayer: vi.fn().mockReturnValue({
    addTo: vi.fn(),
  }),
}));
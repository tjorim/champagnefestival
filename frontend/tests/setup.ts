import "@testing-library/jest-dom";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "@/mocks/server";
import { resetAdminStore } from "@/mocks/handlers/admin";

// Mock SuperTokens before anything imports it.
// Tests control auth state via these mocks rather than a real SuperTokens backend.
vi.mock("supertokens-auth-react", () => ({
  __esModule: true,
  default: {
    init: vi.fn(),
    SuperTokensWrapper: ({ children }: { children: ReactNode }) => children,
  },
  init: vi.fn(),
  SuperTokensWrapper: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("supertokens-auth-react/recipe/session", () => ({
  __esModule: true,
  default: {
    init: vi.fn(),
    useSessionContext: vi.fn().mockReturnValue({ loading: false, doesSessionExist: true }),
    signOut: vi.fn().mockResolvedValue(undefined),
    SessionAuth: ({ children }: { children: ReactNode }) => children,
  },
  useSessionContext: vi.fn().mockReturnValue({ loading: false, doesSessionExist: true }),
  signOut: vi.fn().mockResolvedValue(undefined),
  SessionAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("supertokens-auth-react/recipe/emailpassword", () => ({
  __esModule: true,
  default: { init: vi.fn() },
  init: vi.fn(),
}));

vi.mock("supertokens-auth-react/ui", () => ({
  __esModule: true,
  AuthPage: () => null,
}));

vi.mock("supertokens-auth-react/recipe/emailpassword/prebuiltui", () => ({
  __esModule: true,
  EmailPasswordPreBuiltUI: {},
}));

vi.mock("@/config/supertokens", () => ({
  initSuperTokens: vi.fn(),
}));

// Start the MSW Node server before all tests so the same handlers and seed
// data used by the browser dev worker are also used in Vitest.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// After each test:
//  1. Remove any per-test handler overrides added via server.use(…).
//  2. Reset in-memory data stores so mutations don't bleed between tests.
afterEach(() => {
  server.resetHandlers();
  resetAdminStore();
});

afterAll(() => server.close());

// Mock objects that are not available in jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock leaflet since it doesn't work well in jsdom
vi.mock("leaflet", () => ({
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

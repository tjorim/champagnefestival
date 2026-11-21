import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "@/styles/tailwind.css";
import {
  AdminPage,
  CheckInRoute,
  EmailConsentRoute,
  EmailUnsubscribeRoute,
  MyAccountRoute,
  PebblePairRoute,
  PrivacyPolicyRoute,
  VenuePlanRoute,
} from "@/app/StandaloneRoutes";
import { HomePage } from "@/features/site/HomePage";
import { LazyAuthProvider } from "@/app/providers/LazyAuthProvider";
import { initializeVisualTheme } from "@/app/theme/useVisualTheme";
import { createAppRouter } from "@/app/router";

// Must come after the CSS imports above so the theme <link> is appended after the bundled
// stylesheets: both declare their rules in the `components` layer, where the later one wins ties.
initializeVisualTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createAppRouter({
  App: HomePage,
  AdminPage,
  CheckInRoute,
  PrivacyPolicyRoute,
  PebblePairRoute,
  MyAccountRoute,
  EmailConsentRoute,
  EmailUnsubscribeRoute,
  VenuePlanRoute,
  queryClient,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the App
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found");
  throw new Error("Root element not found");
}

async function enableMocking(): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_MSW === "true") {
    const { worker } = await import("@/mocks/browser");
    await worker.start({ onUnhandledFrame: "warn" });
    // oxlint-disable-next-line no-console -- dev-only notice that the mock API is active
    console.info("[MSW] Mock Service Worker active — using mock API");
  }
}

// Registers the production service worker (src/sw.ts), including push handlers.
// Skipped outside production so it never fights the dev server or the
// opt-in MSW mock worker above, which only ever runs in DEV.
function registerServiceWorker(): void {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err: unknown) => console.error("[SW] Registration failed:", err));
  }
}

/** Lets the pre-mount stylesheet in index.html stop hiding the server fragment React replaced. */
function MarkAppMounted() {
  useEffect(() => {
    document.documentElement.removeAttribute("data-app-pending");
  }, []);
  return null;
}

function renderApp(): void {
  ReactDOM.createRoot(rootElement!).render(
    <React.StrictMode>
      <MarkAppMounted />
      <QueryClientProvider client={queryClient}>
        <LazyAuthProvider
          navigateTo={(to) => router.navigate({ to })}
          subscribe={(onNavigate) =>
            router.subscribe("onBeforeNavigate", ({ toLocation }) =>
              onNavigate(toLocation.pathname),
            )
          }
        >
          <RouterProvider router={router} />
        </LazyAuthProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

registerServiceWorker();

enableMocking()
  .then(renderApp)
  .catch((err: unknown) => {
    console.error("[MSW] Service Worker failed to start, rendering without mocks:", err);
    renderApp();
  });

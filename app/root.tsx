import "@radix-ui/themes/styles.css"; // Import Radix UI global styles
import { Theme } from "@radix-ui/themes";
import "./i18n"; // import i18n
import { useEffect, lazy, Suspense, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Header from "./components/Header";
// Lazy load components that aren't needed immediately
const BubbleBackground = lazy(() => import("./components/BubbleBackground"));

import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { AppProvider } from "./context/AppContext";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

// Add a SkipLink component for accessibility
function SkipLink() {
  const { t } = useTranslation();
  return (
    <a href="#main-content" className="skip-link">
      {t("accessibility.skipToContent", "Skip to main content")}
    </a>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();

  // Update the <html lang="..."> attribute dynamically
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  
  // Add meta viewport and meta description for better SEO and mobile
  useEffect(() => {
    // Check if we should enable dark mode based on user preference
    const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (prefersDarkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  return (
    <html lang={i18n.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="Champagne Festival - Celebrating the finest champagne producers." />
        <meta name="theme-color" content="#6e8efb" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* Skip link for keyboard users */}
        <SkipLink />
        
        {/* Animated background with fallback during loading */}
        <Suspense fallback={<div className="bubble-container-placeholder" />}>
          <BubbleBackground />
        </Suspense>

        {/* Header & Navigation */}
        <Header />

        <main id="main-content">
          {children}
        </main>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Wrap everything in the Radix UI Theme and AppContext provider
export default function App() {
  return (
    <AppProvider>
      <Theme appearance="dark">
        <Outlet /> {/* This allows nested pages to be rendered dynamically */}
      </Theme>
    </AppProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  let message = t("errors.general", "Oops!");
  let details = t("errors.unexpected", "An unexpected error occurred.");
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? t("errors.404", "404") : t("errors.title", "Error");
    details =
      error.status === 404
        ? t("errors.pageNotFound", "The requested page could not be found.")
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="error-container">
      <div className="error-content">
        <h1>{message}</h1>
        <p>{details}</p>
        {stack && (
          <pre className="error-stack">
            <code>{stack}</code>
          </pre>
        )}
        <a href="/" className="error-home-link">{t("errors.backHome", "Back to Home")}</a>
      </div>
    </main>
  );
}

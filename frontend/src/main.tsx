import React, { lazy, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
} from "@tanstack/react-router";
import { AuthProvider as OidcAuthProvider } from "react-oidc-context";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "leaflet/dist/leaflet.css";
import Spinner from "react-bootstrap/Spinner";

import { oidcConfig } from "./config/oidc";
import { AuthProvider } from "./contexts/AuthContext";

import Footer from "./components/Footer";
import Header from "./components/Header";
import SectionHeading from "./components/SectionHeading";
import SuspenseWithBoundary from "./components/SuspenseWithBoundary";
import RegistrationModal from "./components/RegistrationModal";

import LanguageSwitcher from "./components/LanguageSwitcher";
import { useLanguage } from "./hooks/useLanguage";
import { useActiveEdition } from "./hooks/useActiveEdition";
import { m } from "./paraglide/messages";
import { featureItems } from "./config/features";
import { faqIds } from "./config/faq";
import { endOfDay } from "./utils/dateUtils";
import "./index.css";

// Components - Lazy loaded
const BubbleBackground = lazy(() => import("./components/BubbleBackground"));
// Important visible components with deferred loading
const Countdown = lazy(() => import("./components/Countdown"));
const FAQ = lazy(() => import("./components/FAQ"));
const ContactForm = lazy(() => import("./components/ContactForm"));
const Schedule = lazy(() => import("./components/Schedule"));
const CommunityEvents = lazy(() => import("./components/CommunityEvents"));
const AdminDashboard = lazy(() => import("./components/admin/AdminDashboard"));
const CheckInPage = lazy(() => import("./components/CheckInPage"));
const MyRegistrationsPage = lazy(() => import("./components/MyRegistrationsPage"));
// Below-the-fold components
const MarqueeSlider = lazy(() => import("./components/MarqueeSlider"));
const MapComponent = lazy(() => import("./components/MapComponent"));

interface AppSuspenseProps {
  children: React.ReactNode;
  errorFallbackText: string;
}

function AppSuspense({ children, errorFallbackText }: AppSuspenseProps) {
  return (
    <SuspenseWithBoundary
      fallback={
        <div className="text-center p-4">
          <Spinner animation="border" variant="light" />
        </div>
      }
      errorFallback={<div className="text-center p-4">{errorFallbackText}</div>}
    >
      {children}
    </SuspenseWithBoundary>
  );
}

/** Minimal top-bar shown on standalone admin / check-in pages */
function StandaloneNavBar({ iconClass, title }: { iconClass: string; title: string }) {
  return (
    <nav className="navbar bg-dark border-bottom border-secondary px-3 py-2">
      <div className="container-fluid d-flex justify-content-between align-items-center">
        <span className="navbar-brand text-warning fw-bold mb-0">
          <i className={`${iconClass} me-2`} aria-hidden="true" />
          {title}
        </span>
        <div className="d-flex gap-2 align-items-center">
          <LanguageSwitcher />
          <Link to="/" className="btn btn-sm btn-outline-secondary">
            <i className="bi bi-arrow-left me-1" aria-hidden="true" />
            {m.back_to_site()}
          </Link>
        </div>
      </div>
    </nav>
  );
}

// Helper component for MarqueeSlider with Suspense and ErrorBoundary
function SuspendedMarqueeSlider({
  itemsType,
  items,
}: {
  itemsType: "producers" | "sponsors";
  items: Array<{ id: number; name: string; image: string }>;
}) {
  // Get appropriate loading text based on itemsType
  const loadingText = itemsType === "producers" ? m.loading_producers() : m.loading_sponsors();

  const errorText =
    itemsType === "producers" ? m.error_loading_producers() : m.error_loading_sponsors();

  return (
    <SuspenseWithBoundary
      fallback={<div className="carousel-loading">{loadingText}</div>}
      errorFallback={<div className="carousel-error">{errorText}</div>}
    >
      <MarqueeSlider itemsType={itemsType} items={items} />
    </SuspenseWithBoundary>
  );
}

/** Route component for /admin */
function AdminPage() {
  return (
    <div className="App">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar iconClass="bi bi-shield-lock" title={m.admin_title()} />
      <main id="main-content">
        <AppSuspense errorFallbackText={m.admin_error_load_dashboard()}>
          <AdminDashboard visible={true} />
        </AppSuspense>
      </main>
    </div>
  );
}

/** Route component for /check-in */
function CheckInRoute() {
  return (
    <div className="App">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar iconClass="bi bi-qr-code-scan" title={m.checkin_title()} />
      <main id="main-content">
        <AppSuspense errorFallbackText={m.admin_error_load_checkin()}>
          <CheckInPage />
        </AppSuspense>
      </main>
    </div>
  );
}

/** Route component for /my-registrations */
function MyRegistrationsRoute() {
  return (
    <div className="App">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar iconClass="bi bi-ticket-perforated" title={m.my_registrations_title()} />
      <main id="main-content">
        <AppSuspense errorFallbackText={m.my_registrations_error()}>
          <MyRegistrationsPage />
        </AppSuspense>
      </main>
    </div>
  );
}

function App() {
  // Use custom hooks for language
  useLanguage();

  // Fetch live edition data; keep an empty fallback shape on API errors.
  const { edition } = useActiveEdition();
  const { producers, sponsors } = edition;

  // Derive festival start/end dates from the active edition
  const festivalDate = useMemo(() => {
    const d = new Date(edition.dates[0] ?? new Date());
    d.setHours(17, 0, 0, 0);
    return d;
  }, [edition]);

  const festivalEndDate = useMemo(() => {
    return endOfDay(edition.dates[edition.dates.length - 1] ?? new Date());
  }, [edition]);

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);

  const registrableEvents = useMemo(() => {
    const now = new Date();
    return edition.events
      .filter((event) => event.registrationRequired)
      .filter((event) => {
        const eventEnd = endOfDay(new Date(`${event.date}T00:00:00`));
        return eventEnd >= now;
      })
      .filter(
        (event) => !event.registrationsOpenFrom || new Date(event.registrationsOpenFrom) <= now,
      );
  }, [edition.events]);

  // --- Main marketing page ---

  return (
    <div className="App">
      {/* Skip link for keyboard users */}
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>

      {/* Animated background */}
      <SuspenseWithBoundary
        fallback={
          <div className="bubble-background-placeholder" aria-label={m.loading_background()} />
        }
        errorFallback={null}
      >
        <BubbleBackground />
      </SuspenseWithBoundary>

      {/* Header & Navigation */}
      <Header />

      <main id="main-content">
        {/* Hero Section */}
        <section className="hero" id="welcome">
          <h1 className="brand-title">{m.welcome_title()}</h1>
          <p className="hero-subtitle">{m.welcome_subtitle()}</p>
          <a
            href="#next-festival"
            className="btn bg-brand-gradient text-white rounded-pill border-0 py-2 px-4 fw-bold"
          >
            {m.welcome_learn_more()}
            <i className="bi bi-arrow-down-circle ms-2"></i>
          </a>
        </section>

        {/* What we do */}
        <section id="what-we-do" className="content-section">
          <div className="container text-center">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading id="what-we-do-heading" title={m.what_we_do_title()} />
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <p>{m.what_we_do_description()}</p>
                <p>{m.what_we_do_for_everyone()}</p>
              </div>
            </div>
            {/* Features in full width to display side by side */}
            <div className="features">
              {featureItems.map((feature) => (
                <div key={feature.id} className="feature">
                  <h3>{feature.getTitle()}</h3>
                  <p>{feature.getDesc()}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Next Festival with Countdown */}
        <section id="next-festival" className="content-section highlight-section">
          <div className="container text-center">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading id="next-festival-heading" title={m.next_festival_title()} />
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <AppSuspense errorFallbackText={m.error_countdown()}>
                  <Countdown targetDate={festivalDate} endDate={festivalEndDate} />
                </AppSuspense>
                <p className="mb-4" style={{ position: "relative", zIndex: 50 }}>
                  {m.next_festival_description()}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Schedule Section */}
        <section id="schedule" className="content-section">
          <div className="container">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading
              id="schedule-heading"
              title={m.schedule_title()}
              subtitle={m.schedule_description()}
            />
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <div className="schedule-container">
                  <AppSuspense errorFallbackText={m.error_schedule()}>
                    <Schedule events={edition.events} />
                  </AppSuspense>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Community Events */}
        <AppSuspense errorFallbackText={m.community_events_error_load()}>
          <CommunityEvents />
        </AppSuspense>

        {/* Producers Carousel */}
        <section id="producers" className="content-section">
          <div className="container text-center">
            {/* Replaced h2 with SectionHeading and added subtitle */}
            <SectionHeading id="producers-heading" title={m.producers_title()} />
            {/* Removed redundant <p> tag */}
            <SuspendedMarqueeSlider itemsType="producers" items={producers} />
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="content-section">
          <div className="container">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading id="faq-heading" title={m.faq_title()} />
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <AppSuspense errorFallbackText={m.error_faq()}>
                  <FAQ ids={faqIds} />
                </AppSuspense>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Map - Moved here */}
        <section id="map" className="content-section">
          <div className="container">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading id="map-heading" title={m.location_title()} />
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <SuspenseWithBoundary
                  fallback={
                    <div className="map-loading d-flex align-items-center justify-content-center py-5">
                      <div className="text-center">
                        <Spinner animation="border" variant="primary" />
                        <p className="mt-2">{m.loading()}</p>
                      </div>
                    </div>
                  }
                  errorFallback={<div className="map-error">{m.error_loading_map()}</div>}
                >
                  <MapComponent
                    location={edition.venue.venueName}
                    address={edition.venue.address}
                    coordinates={edition.venue.coordinates}
                  />
                </SuspenseWithBoundary>
              </div>
            </div>
          </div>
        </section>

        {/* Sponsors Carousel */}
        <section id="sponsors" className="content-section highlight-section">
          <div className="container text-center">
            {/* Replaced h2 with SectionHeading and added subtitle */}
            <SectionHeading id="sponsors-heading" title={m.sponsors_title()} />
            {/* Removed redundant <p> tag */}
            <SuspendedMarqueeSlider itemsType="sponsors" items={sponsors} />
          </div>
        </section>

        {/* Contact Form */}
        <section id="contact" className="content-section">
          <div className="container">
            {/* Replaced h2 with SectionHeading and added subtitle */}
            <SectionHeading
              id="contact-heading"
              title={m.contact_title()}
              subtitle={m.contact_intro()}
            />
            {/* Removed redundant <p> tag */}
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <AppSuspense errorFallbackText={m.error_contact()}>
                  <ContactForm />
                </AppSuspense>
              </div>
            </div>
          </div>
        </section>

        {/* VIP Registrations Section */}
        <section id="registrations" className="content-section highlight-section">
          <div className="container text-center">
            <SectionHeading
              id="registrations-heading"
              title={m.registration_title()}
              subtitle={m.registration_description()}
            />
            <button
              type="button"
              className="btn btn-warning btn-lg rounded-pill px-5 fw-bold"
              onClick={() => setShowRegistrationModal(true)}
              disabled={registrableEvents.length === 0}
            >
              <i className="bi bi-calendar-plus me-2" aria-hidden="true" />
              {m.registration_cta()}
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <Footer />

      {/* VIP Registration Modal */}
      <RegistrationModal
        show={showRegistrationModal}
        onHide={() => setShowRegistrationModal(false)}
        event={registrableEvents[0] ?? null}
      />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const rootRoute = createRootRoute({
  notFoundComponent: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

const checkInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/check-in",
  validateSearch: (search: Record<string, unknown>): { id?: string; token?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: CheckInRoute,
});

const myRegistrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-registrations",
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: MyRegistrationsRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  adminRoute,
  checkInRoute,
  myRegistrationsRoute,
]);

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
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
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "warn" });
    console.info("[MSW] Mock Service Worker active — using mock API");
  }
}

function renderApp(): void {
  ReactDOM.createRoot(rootElement!).render(
    <React.StrictMode>
      <OidcAuthProvider {...oidcConfig}>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </AuthProvider>
      </OidcAuthProvider>
    </React.StrictMode>,
  );
}

enableMocking()
  .then(renderApp)
  .catch((err: unknown) => {
    console.error("[MSW] Service Worker failed to start, rendering without mocks:", err);
    renderApp();
  });

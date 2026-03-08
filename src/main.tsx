import React, { lazy } from "react";
import ReactDOM from "react-dom/client";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "leaflet/dist/leaflet.css";
import Spinner from "react-bootstrap/Spinner";

import Footer from "./components/Footer";
import Header from "./components/Header";
import SectionHeading from "./components/SectionHeading";
import SuspenseWithBoundary from "./components/SuspenseWithBoundary";

import { useLanguage } from "./hooks/useLanguage";
import { useScrollNavigation } from "./hooks/useScrollNavigation";
import { useServiceWorker } from "./hooks/useServiceWorker";
import { m } from "./paraglide/messages";
import { festivalDate } from "./config/dates";
import { featureItems } from "./config/features";
import { faqIds } from "./config/faq";
import { producerItems, sponsorItems } from "./config/marqueeSlider";
import "./index.css";

// Components - Lazy loaded
const BubbleBackground = lazy(() => import("./components/BubbleBackground"));
// Important visible components with deferred loading
const Countdown = lazy(() => import("./components/Countdown"));
const FAQ = lazy(() => import("./components/FAQ"));
const ContactForm = lazy(() => import("./components/ContactForm"));
const Schedule = lazy(() => import("./components/Schedule"));
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

function App() {
  // Use custom hooks for language, navigation, and service worker
  useLanguage();
  useScrollNavigation();
  useServiceWorker();

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
                  <Countdown targetDate={festivalDate} />
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
            <SectionHeading id="schedule-heading" title={m.schedule_title()} />
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <div className="schedule-container">
                  <AppSuspense errorFallbackText={m.error_schedule()}>
                    <Schedule />
                  </AppSuspense>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Producers Carousel */}
        <section id="producers" className="content-section">
          <div className="container text-center">
            {/* Replaced h2 with SectionHeading and added subtitle */}
            <SectionHeading id="producers-heading" title={m.producers_title()} />
            {/* Removed redundant <p> tag */}
            <SuspendedMarqueeSlider itemsType="producers" items={producerItems} />
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
                  <MapComponent />
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
            <SuspendedMarqueeSlider itemsType="sponsors" items={sponsorItems} />
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
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

// Render the App
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found");
  throw new Error("Root element not found");
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Service worker registration is now handled by the useServiceWorker hook

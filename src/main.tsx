// React and libraries
import React, { useEffect, lazy, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from "react-i18next";
import ReactDOM from 'react-dom/client';

// Custom hooks
import { useScrollNavigation } from './hooks/useScrollNavigation';
import { useLanguage } from './hooks/useLanguage';
import { useServiceWorker } from './hooks/useServiceWorker';

// UI Libraries
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'leaflet/dist/leaflet.css'; // Import Leaflet CSS directly
import Spinner from "react-bootstrap/Spinner";

// Components - Eagerly loaded (critical path components)
import Header from "./components/Header";
import Footer from "./components/Footer";

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

import './i18n'; // Import i18n configuration
import './index.css';
import { producerItems, sponsorItems } from "./config/marqueeSlider";
import { faqKeys } from "./config/faq";
import { featureItems } from "./config/features";
import { festivalDate } from "./config/dates";

// Helper component for MarqueeSlider with Suspense
function SuspendedMarqueeSlider({ itemsType, items }: { itemsType: "producers" | "sponsors"; items: Array<{ id: number; name: string; image: string; }> }) {
  const { t } = useTranslation();
  
  // Get appropriate loading text based on itemsType
  const loadingText = itemsType === "producers" 
    ? t("loading.producers", "Loading producers...") 
    : t("loading.sponsors", "Loading sponsors...");
    
  return (
    <Suspense fallback={<div className="carousel-loading">{loadingText}</div>}>
      <MarqueeSlider itemsType={itemsType} items={items} />
    </Suspense>
  );
}

function App() {
  const { t, i18n } = useTranslation();

  // Use custom hooks for language, navigation, and service worker
  useLanguage(i18n, 'nl');
  useScrollNavigation();
  useServiceWorker();

  return (
    <div className="App">
      {/* Skip link for keyboard users */}
      <a href="#main-content" className="skip-link">
        {t("accessibility.skipToContent", "Skip to main content")}
      </a>

      {/* Animated background */}
      <Suspense fallback={<div className="bubble-background-placeholder" aria-label={t("loading.background", "Loading background...")} />}>
        <BubbleBackground />
      </Suspense>

      {/* Header & Navigation */}
      <Header />

      <main id="main-content">
        {/* Hero Section */}
        <section className="hero" id="welcome">
          <h1 className="brand-title">
            {t("welcome.title", "Welcome to Champagne Festival")}
          </h1>
          <p className="hero-subtitle">{t("welcome.subtitle", "A celebration of fine champagne and community")}</p>
          <a href="#next-festival" className="cta-button">
            {t("welcome.learnMore", "Learn More")}
            <i className="bi bi-arrow-down-circle ms-2"></i>
          </a>
        </section>

        {/* What we do */}
        <section id="what-we-do" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">
              {t("whatWeDo.title", "What We Do")}
            </h2>
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <p>{t("whatWeDo.description", "Our Champagne Festival brings together passionate producers from the Champagne region, enthusiasts, and our local community for an unforgettable celebration of this magnificent beverage.")}</p>
              </div>
            </div>
            {/* Features in full width to display side by side */}
            <div className="features">
              {featureItems.map((feature) => (
                <div key={feature.id} className="feature">
                  <h3>{t(feature.titleKey, feature.fallbackTitle)}</h3>
                  <p>{t(feature.descKey, feature.fallbackDesc)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Next Festival with Countdown */}
        <section id="next-festival" className="content-section highlight-section">
          <div className="container text-center">
            <h2 className="section-header">
              {t("nextFestival.title", "Next Festival")}
            </h2>
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <Countdown targetDate={festivalDate} />
                <p className="mb-4" style={{ position: 'relative', zIndex: 50 }}>
                  {t("nextFestival.description", "Join us for our next festival where we'll feature over 20 champagne producers from around the world.")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Schedule Section */}
        <section id="schedule" className="content-section">
          <div className="container">
            <h2 className="section-header text-center">
              {t("schedule.title", "Schedule")}
            </h2>
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <div className="schedule-container">
                  <Schedule />
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* Producers Carousel */}
        <section id="producers" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">
              {t("producers.title", "Champagne Producers")}
            </h2>
            <p>{t("producers.intro", "Explore our selection of premium champagne producers from the region:")}</p>
            <SuspendedMarqueeSlider itemsType="producers" items={producerItems} />
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="content-section">
          <div className="container">
            <h2 className="section-header text-center">
              {t("faq.title", "Frequently Asked Questions")}
            </h2>
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <FAQ keys={faqKeys} />
              </div>
            </div>
          </div>
        </section>
        
        {/* Interactive Map - Moved here */}
        <section id="map" className="content-section">
          <div className="container">
            <h2 className="section-header text-center">
              {t("location.title", "Event Location")}
            </h2>
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <ErrorBoundary fallback={<div className="map-error">{t("error", "Error loading map")}</div>}>
                  <Suspense fallback={<div className="map-loading d-flex align-items-center justify-content-center py-5">
                    <div className="text-center">
                      <Spinner animation="border" variant="primary" />
                      <p className="mt-2">{t("loading", "Loading map...")}</p>
                    </div>
                  </div>}>
                    <MapComponent />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </section>

        {/* Sponsors Carousel */}
        <section id="sponsors" className="content-section highlight-section">
          <div className="container text-center">
            <h2 className="section-header">
              {t("sponsors.title", "Sponsors")}
            </h2>
            <p>{t("sponsors.intro", "Our event is made possible by the generous support of our sponsors:")}</p>
            <SuspendedMarqueeSlider itemsType="sponsors" items={sponsorItems} />
          </div>
        </section>

        {/* Contact Form */}
        <section id="contact" className="content-section">
          <div className="container">
            <h2 className="section-header text-center">
              {t("contact.title", "Contact Us")}
            </h2>
            <p className="text-center">{t("contact.intro", "Have questions or want to become a sponsor? Reach out to us!")}</p>
            <div className="row justify-content-center">
              <div className="col-md-10 col-lg-8">
                <ContactForm />
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
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found');
  throw new Error('Root element not found');
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker registration is now handled by the useServiceWorker hook
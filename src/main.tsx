// React and libraries
import React, { useEffect, lazy, Suspense } from 'react';
import { useTranslation } from "react-i18next";
import ReactDOM from 'react-dom/client';

// UI Libraries
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { CalendarDaysIcon, TicketIcon, MapPinIcon } from "@heroicons/react/24/outline";

// Components - Eagerly loaded
import Header from "./components/Header";
import Countdown from "./components/Countdown";
import FAQ from "./components/FAQ";
import ContactForm from "./components/ContactForm";
import Footer from "./components/Footer";

// Components - Lazy loaded
const BubbleBackground = lazy(() => import("./components/BubbleBackground"));
const Carousel = lazy(() => import("./components/Carousel"));
const MapComponent = lazy(() => import("./components/MapComponent"));

import './i18n'; // Import i18n configuration
import './index.css';
import { producerItems, sponsorItems } from "./config/carousel";
import { faqData } from "./config/faq";

function App() {
  const { t, i18n } = useTranslation();

  // Update the <html lang="..."> attribute dynamically
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  // Festival date
  const festivalDate = new Date("2025-03-07T00:00:00");

  // Helper component for Carousels with Suspense
  function SuspendedCarousel({ itemsType, items }: { itemsType: "producers" | "sponsors"; items: Array<{ id: number; name: string; image: string; }> }) {
    return (
      <Suspense fallback={<div className="carousel-loading">{t("loading", "Loading...")}</div>}>
        <Carousel itemsType={itemsType} items={items} />
      </Suspense>
    );
  }

  return (
    <Theme appearance="dark">
      <div className="App">
        {/* Skip link for keyboard users */}
        <a href="#main-content" className="skip-link">
          {t("accessibility.skipToContent", "Skip to main content")}
        </a>

        {/* Animated background */}
        <Suspense fallback={<div className="bubble-container-placeholder" />}>
          <BubbleBackground />
        </Suspense>

        {/* Header & Navigation */}
        <Header />

        <main id="main-content">
          {/* Hero Section */}
          <section className="hero" id="welcome">
            <h1>{t("welcome.title", "Welcome to Champagne Festival")}</h1>
            <p className="hero-subtitle">{t("welcome.subtitle", "A celebration of fine champagne and community")}</p>
            <a href="#next-festival" className="cta-button">
              {t("welcome.learnMore", "Learn More")}
            </a>
          </section>

          {/* What we do */}
          <section id="what-we-do" className="content-section">
            <div className="container">
              <h2>{t("whatWeDo.title", "What We Do")}</h2>
              <p>{t("whatWeDo.description", "Our Champagne Festival brings together passionate producers from the Champagne region, enthusiasts, and our local community for an unforgettable celebration of this magnificent beverage.")}</p>
              <div className="features">
                {[
                  { id: 1, titleKey: 'whatWeDo.feature1.title', descKey: 'whatWeDo.feature1.description', fallbackTitle: 'Feature 1', fallbackDesc: 'Description for feature 1' },
                  { id: 2, titleKey: 'whatWeDo.feature2.title', descKey: 'whatWeDo.feature2.description', fallbackTitle: 'Feature 2', fallbackDesc: 'Description for feature 2' },
                  { id: 3, titleKey: 'whatWeDo.feature3.title', descKey: 'whatWeDo.feature3.description', fallbackTitle: 'Feature 3', fallbackDesc: 'Description for feature 3' },
                ].map((feature) => (
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
            <div className="container">
              <h2 className="flex items-center">
                <CalendarDaysIcon className="w-5 h-5 inline-block mr-2 text-indigo-400" />
                {t("nextFestival.title", "Next Festival")}
              </h2>
              <Countdown targetDate={festivalDate} />
              <p className="flex items-center justify-center gap-2 text-center mb-8">
                <TicketIcon className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                {t("nextFestival.description", "Join us for our next festival where we'll feature over 20 champagne producers from around the world.")}
              </p>
            </div>
          </section>

          {/* Schedule Section */}
          <section id="schedule" className="content-section">
            <div className="container">
              <h2>{t("schedule.title", "Schedule")}</h2>
              <div className="schedule-table">
                <p>{t("schedule.description", "Festival schedule details go here.")}</p>
              </div>
            </div>
          </section>

          {/* Interactive Map */}
          <section id="map" className="content-section">
            <div className="container">
              <h2 className="flex items-center">
                <MapPinIcon className="w-5 h-5 mr-2 text-indigo-400" />

                {t("location.title", "Event Location")}
              </h2>
              <Suspense fallback={<div className="map-loading">{t("loading", "Loading map...")}</div>}>
                <MapComponent />
              </Suspense>
            </div>
          </section>

          {/* Carousels for Producers & Sponsors */}
          <section id="carousel" className="content-section">
            <div className="container">
              <h2>{t("producers.title", "Champagne Producers")}</h2>
              <SuspendedCarousel itemsType="producers" items={producerItems} />

              <h2>{t("sponsors.title", "Sponsors")}</h2>
              <SuspendedCarousel itemsType="sponsors" items={sponsorItems} />
            </div>
          </section>

          {/* FAQ Section */}
          <section id="faq" className="content-section">
            <div className="container">
              <h2>{t("faq.title", "Frequently Asked Questions")}</h2>
              <FAQ faqItems={faqData} />
            </div>
          </section>

          {/* Contact Form */}
          <section id="contact" className="content-section">
            <div className="container">
              <h2>{t("contact.title", "Contact Us")}</h2>
              <p>{t("contact.intro", "Have questions or want to become a sponsor? Reach out to us!")}</p>
              <ContactForm />
            </div>
          </section>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </Theme>
  );
}

// Render the App
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
import React, { useEffect, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { useTranslation } from "react-i18next";
import { Theme } from "@radix-ui/themes";
import { CalendarDaysIcon, TicketIcon } from "@heroicons/react/24/outline";
import "@radix-ui/themes/styles.css";
import './i18n'; // Import i18n configuration
import './index.css';

// Components
import Header from "./components/Header";
import Countdown from "./components/Countdown";
import FAQ from "./components/FAQ";
import ContactForm from "./components/ContactForm";
import Footer from "./components/Footer";

// Lazy load components that aren't immediately visible
const BubbleBackground = lazy(() => import("./components/BubbleBackground"));
const Carousel = lazy(() => import("./components/Carousel"));
const MapComponent = lazy(() => import("./components/MapComponent"));

function App() {
  const { t, i18n } = useTranslation();

  // Update the <html lang="..."> attribute dynamically
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    // Set dark theme globally
    document.documentElement.setAttribute("data-theme", "dark");
  }, [i18n.language]);

  // Festival date
  const festivalDate = "2025-03-07T00:00:00";

  function SuspendedCarousel({ itemsType }: { itemsType: string }) {
    return (
      <Suspense fallback={<div className="carousel-loading">{t("loading", "Loading...")}</div>}>
        <Carousel itemsType={itemsType} />
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
              <p>{t("whatWeDo.description", "Our festival brings together champagne producers, enthusiasts, and the community for a celebration of this magnificent beverage.")}</p>
              <div className="features">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="feature">
                    <h3>{t(`whatWeDo.feature${item}.title`, `Feature ${item}`)}</h3>
                    <p>{t(`whatWeDo.feature${item}.description`, `Description for feature ${item}`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Next Festival with Countdown */}
          <section id="next-festival" className="content-section highlight-section">
            <div className="container">
              <h2 className="flex items-center">
                <CalendarDaysIcon className="w-3 h-3 inline-block mr-2 text-indigo-400" />
                {t("nextFestival.title", "Next Festival")}
              </h2>
              <Countdown targetDate={festivalDate} />
              <p className="flex items-center justify-center gap-2 text-center mb-8">
                <TicketIcon className="h-3 w-3 text-indigo-400 flex-shrink-0" />
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
                <svg className="w-3 h-3 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
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
              <SuspendedCarousel itemsType="producers" />

              <h2>{t("sponsors.title", "Sponsors")}</h2>
              <SuspendedCarousel itemsType="sponsors" />
            </div>
          </section>

          {/* FAQ Section */}
          <section id="faq" className="content-section">
            <div className="container">
              <h2>{t("faq.title", "Frequently Asked Questions")}</h2>
              <FAQ />
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
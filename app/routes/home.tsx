import { useTranslation } from "react-i18next";
import { useMemo, lazy, Suspense } from "react";
import type { Route } from "../+types/home"; // Updated import path
import { useApp } from "../context/AppContext";
import { useWindowSize } from "../hooks/useWindowSize";

import Countdown from "../components/Countdown";
import FAQ from "../components/FAQ";
import ContactForm from "../components/ContactForm";
import Footer from "../components/Footer";

// Lazy load components that aren't immediately visible
const Carousel = lazy(() => import("../components/Carousel"));
const MapComponent = lazy(() => import("../components/MapComponent"));

// Meta function that gets the page metadata
export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Champagne Festival" },
    { 
      name: "description", 
      content: "Join us at the Champagne Festival! Experience exquisite champagnes, meet renowned producers, and enjoy a celebration of bubbles and community." 
    },
    { name: "keywords", content: "champagne, festival, wine, celebration, event" },
  ];
}

/**
 * Home page component
 */
export default function Home() {
  const { t } = useTranslation();
  const { theme } = useApp();
  const { isMobile } = useWindowSize();
  
  // Memoize the festival date to prevent unnecessary re-rendering
  const festivalDate = useMemo(() => "2025-03-07T00:00:00", []);

  return (
    <div className={`App ${theme === 'dark' ? 'dark-mode' : ''}`}>
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
          <h2>{t("nextFestival.title", "Next Festival")}</h2>
          <Countdown targetDate={festivalDate} />
          <p>{t("nextFestival.description", "Join us for our next festival where we'll feature over 20 champagne producers from around the world.")}</p>
        </div>
      </section>
      
      {/* Schedule Section */}
      <section id="schedule" className="content-section">
        <div className="container">
          <h2>{t("schedule.title", "Schedule")}</h2>
          <div className="schedule-table">
            {/* Schedule content would go here */}
            <p>{t("schedule.description", "Festival schedule details go here.")}</p>
          </div>
        </div>
      </section>
      
      {/* Interactive Map */}
      <section id="map" className="content-section">
        <div className="container">
          <h2>{t("location.title", "Event Location")}</h2>
          <Suspense fallback={<div className="map-loading">{t("loading", "Loading map...")}</div>}>
            <MapComponent />
          </Suspense>
        </div>
      </section>
      
      {/* Carousels for Producers & Sponsors */}
      <section id="carousel" className="content-section">
        <div className="container">
          <h2>{t("producers.title", "Champagne Producers")}</h2>
          <Suspense fallback={<div className="carousel-loading">{t("loading", "Loading...")}</div>}>
            <Carousel itemsType="producers" />
          </Suspense>
          
          <h2>{t("sponsors.title", "Sponsors")}</h2>
          <Suspense fallback={<div className="carousel-loading">{t("loading", "Loading...")}</div>}>
            <Carousel itemsType="sponsors" />
          </Suspense>
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
      
      {/* Footer */}
      <Footer />
    </div>
  );
}

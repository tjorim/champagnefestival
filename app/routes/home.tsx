import { useTranslation } from "react-i18next"; // Import useTranslation
import type { Route } from "./+types/home"; // Import Route type for type safety

import Carousel from "../components/Carousel";
import Countdown from "../components/Countdown";
import MapComponent from "../components/MapComponent";
import FAQ from "../components/FAQ";
import ContactForm from "../components/ContactForm";
import Footer from "../components/Footer";
import "../app.css"; // Add a custom stylesheet for this route if necessary

// Meta function that gets the page metadata
export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Champagne Festival" }, // Translatable title
    { name: "description", content: "Welcome to the Champagne Festival site!" }, // Translatable description
  ];
}

export default function Home() {
  const { t } = useTranslation(); // Get translation function

  return (
    <div className="App">
      {/* The Welcome section */}
      <h1>{t("welcome.title")}</h1> {/* Use t function to translate content */}
      {/* What we do */}
      <section id="what-we-do">
        <h2>{t("whatWeDo.title")}</h2> {/* Translated section header */}
        <p>{t("whatWeDo.description")}</p> {/* Translated description */}
      </section>
      {/* Next Festival with Countdown */}
      <section id="next-festival">
        <h2>{t("nextFestival.title")}</h2>
        <Countdown targetDate="2025-03-07T00:00:00" />
        <p>{t("nextFestival.description")}</p>
      </section>
      {/* Schedule Section */}
      <section id="schedule">
        <h2>Schedule</h2>
        <p>Festival schedule details go here.</p>
      </section>
      {/* Interactive Map */}
      <section id="map">
        <h2>Event Location</h2>
        <MapComponent />
      </section>
      {/* Carousels for Producers & Sponsors */}
      <section id="carousel">
        <h2>Champagne Producers</h2>
        <Carousel itemsType="producers" />
        <h2>Sponsors</h2>
        <Carousel itemsType="sponsors" />
      </section>
      {/* FAQ Section */}
      <section id="faq">
        <h2>FAQ</h2>
        <FAQ />
      </section>
      {/* Contact Form */}
      <section id="contact">
        <h2>Contact Us</h2>
        <ContactForm />
      </section>
      {/* Footer */}
      <Footer />
    </div>
  );
}

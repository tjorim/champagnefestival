import { Suspense } from 'react';
import { getCarouselItems, getFaqItems, getEventDetails, getDictionaryData } from '@/lib/data';
import Link from 'next/link';

// Import UI components
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import BubbleBackground from '@/app/components/BubbleBackground';
import Countdown from '@/app/components/Countdown';
import Carousel from '@/app/components/Carousel';
import FAQ from '@/app/components/FAQ';
import MapComponent from '@/app/components/MapComponent';
import ContactForm from '@/app/components/ContactForm';
import ContactInfo from '@/app/components/ContactInfo';
import LocationInfo from '@/app/components/LocationInfo';
import Schedule from '@/app/components/Schedule';

/**
 * Renders the Home page for the festival website using localized data.
 *
 * This asynchronous component fetches the necessary content based on the provided language code. It retrieves dictionary data, carousel items, event details, and FAQ items, and then renders multiple sections including a hero section with countdown, about, producers gallery, venue details with a map, FAQ, and a contact form. The component utilizes lazy loading via React's Suspense for the carousel and map components to display fallback loading indicators during data fetching.
 *
 * @param params - An object that contains the language code.
 * @param params.lang - The language code used to load localized content.
 *
 * @returns A JSX element representing the complete Home page layout.
 */
export default async function Home({ params }: { params: { lang: string } }) {
  // Extract lang safely and ensure consistent format for hydration
  const lang = (await params)?.lang ?? 'en';
  const formattedLang = lang.split('-')[0]; // Use only primary language code
  
  // Get all data in parallel for the current language
  const [dict, producerItems, eventDetails] = await Promise.all([
    getDictionaryData(formattedLang),
    getCarouselItems('producers'),
    // getEventDetails requires dict, so we'll get it separately
    getDictionaryData(formattedLang).then(dict => getEventDetails(dict))
  ]);
  
  // Get FAQ items after we have the dictionary
  const faqItems = await getFaqItems(dict);
  
  return (
    <>
      <Link href="#main-content" className="skip-link">
        {dict.accessibility.skipToContent}
      </Link>
      <Header lang={formattedLang} dictionary={dict} />
      <BubbleBackground />
      
      <main id="main-content">
        {/* Hero Section */}
        <section className="hero" id="welcome">
          <h1>{dict.welcome.title}</h1>
          <p className="hero-subtitle">{dict.welcome.subtitle}</p>
          <Link href={`/${formattedLang}#next-festival`} className="cta-button">
            {dict.welcome.learnMore}
          </Link>
        </section>

        {/* What we do */}
        <section id="what-we-do" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{dict.whatWeDo.title}</h2>
            <p className="mx-auto">{dict.whatWeDo.description}</p>
            <div className="features">
              <div className="feature">
                <h3>{dict.whatWeDo.feature1.title}</h3>
                <p>{dict.whatWeDo.feature1.description}</p>
              </div>
              <div className="feature">
                <h3>{dict.whatWeDo.feature2.title}</h3>
                <p>{dict.whatWeDo.feature2.description}</p>
              </div>
              <div className="feature">
                <h3>{dict.whatWeDo.feature3.title}</h3>
                <p>{dict.whatWeDo.feature3.description}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Next Festival with Countdown */}
        <section id="next-festival" className="content-section highlight-section">
          <div className="container text-center">
            <h2 className="section-header">{dict.nextFestival.title}</h2>
            <Countdown targetDate={eventDetails.dates.start} dictionary={dict} />
            <p className="mb-4 mx-auto" style={{ position: 'relative', zIndex: 50 }}>
              {dict.nextFestival.description}
            </p>
          </div>
        </section>
        
        {/* Schedule Section */}
        <section id="schedule" className="content-section">
          <div className="container">
            <h2 className="section-header text-center">{dict.schedule.title}</h2>
            <p className="text-center mx-auto mb-5" style={{ maxWidth: '800px' }}>{dict.schedule.description}</p>
            <div className="schedule-table">
              <Schedule dictionary={dict} />
            </div>
          </div>
        </section>
        
        {/* Carousels for Producers */}
        <section id="carousel" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{dict.producers.title}</h2>
            <Suspense fallback={<div className="carousel-loading">{dict.loading}</div>}>
              <Carousel itemsType="producers" items={producerItems} />
            </Suspense>
          </div>
        </section>

        {/* Interactive Map */}
        <section id="map" className="content-section">
          <div className="container text-center">
            <h2 className="section-header mb-4">{dict.location.title}</h2>
            <div className="row mb-4">
              <div className="col-lg-10 mx-auto">
                <LocationInfo dictionary={dict} />
              </div>
            </div>
            <Suspense fallback={<div className="map-loading d-flex align-items-center justify-content-center py-5">
              <div className="text-center">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">{dict.loading}</span>
                </div>
                <p className="mt-2">{dict.loading}</p>
              </div>
            </div>}>
              <MapComponent dictionary={dict} />
            </Suspense>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{dict.faq.title}</h2>
            <FAQ items={faqItems} />
          </div>
        </section>

        {/* Contact Form */}
        <section id="contact" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{dict.contact.title}</h2>
            <p>{dict.contact.intro}</p>
            <div className="row">
              <div className="col-lg-8 mx-auto">
                <ContactForm dictionary={dict} />
              </div>
            </div>
            <div className="mt-4">
              <ContactInfo dictionary={dict} />
            </div>
          </div>
        </section>
      </main>
      
      <Footer lang={formattedLang} dictionary={dict} />
    </>
  );
}
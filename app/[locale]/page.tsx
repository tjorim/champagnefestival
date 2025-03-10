'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { producerItems, sponsorItems } from '@/app/config/marqueeSlider';
import Link from 'next/link';
import { eventDetails } from '@/app/config/schedule';

// Import UI components
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import BubbleBackground from '@/app/components/BubbleBackground';
import Countdown from '@/app/components/Countdown';
import MarqueeSlider from '@/app/components/MarqueeSlider';
import FAQ from '@/app/components/FAQ';
import MapComponent from '@/app/components/MapComponent';
import ContactForm from '@/app/components/ContactForm';
import ContactInfo from '@/app/components/ContactInfo';
import LocationInfo from '@/app/components/LocationInfo';
import Schedule from '@/app/components/Schedule';
import { useLocale } from 'next-intl';

/**
 * Renders the Home page for the festival website using next-intl for localization.
 */
export default function HomePage() {
  const locale = useLocale();
  const t = useTranslations();
  const tWelcome = useTranslations('welcome');
  const tWhatWeDo = useTranslations('whatWeDo');
  const tNextFestival = useTranslations('nextFestival');
  const tProducers = useTranslations('producers');
  const tSchedule = useTranslations('schedule');
  const tSponsors = useTranslations('sponsors');
  const tLocation = useTranslations('location');
  const tFaq = useTranslations('faq');
  const tContact = useTranslations('contact');
  const tAccessibility = useTranslations('accessibility');
  
  return (
    <>
      <Link href="#main-content" className="skip-link">
        {tAccessibility('skipToContent')}
      </Link>
      <Header lang={locale} />
      <BubbleBackground />
      
      <main id="main-content">
        {/* Hero Section */}
        <section className="hero" id="welcome">
          <h1>{tWelcome('title')}</h1>
          <p className="hero-subtitle">{tWelcome('subtitle')}</p>
          <Link href={`/${locale}#next-festival`} className="cta-button">
            {tWelcome('learnMore')}
          </Link>
        </section>

        {/* What we do */}
        <section id="what-we-do" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{tWhatWeDo('title')}</h2>
            <p className="mx-auto">{tWhatWeDo('description')}</p>
            <div className="features">
              <div className="feature">
                <h3>{tWhatWeDo('feature1.title')}</h3>
                <p>{tWhatWeDo('feature1.description')}</p>
              </div>
              <div className="feature">
                <h3>{tWhatWeDo('feature2.title')}</h3>
                <p>{tWhatWeDo('feature2.description')}</p>
              </div>
              <div className="feature">
                <h3>{tWhatWeDo('feature3.title')}</h3>
                <p>{tWhatWeDo('feature3.description')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Next Festival with Countdown */}
        <section id="next-festival" className="content-section highlight-section">
          <div className="container text-center">
            <h2 className="section-header">{tNextFestival('title')}</h2>
            <Countdown targetDate={eventDetails.dates.start} />
            <p className="mb-4 mx-auto" style={{ position: 'relative', zIndex: 50 }}>
              {tNextFestival('description')}
            </p>
          </div>
        </section>
        
        {/* Producers Marquee */}
        <section id="producers" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{tProducers('title')}</h2>
            <Suspense fallback={<div className="carousel-loading">{t('loading')}</div>}>
              <MarqueeSlider 
                itemsType="producers" 
                items={producerItems}
              />
            </Suspense>
          </div>
        </section>
        
        {/* Schedule Section */}
        <section id="schedule" className="content-section">
          <div className="container">
            <h2 className="section-header text-center">{tSchedule('title')}</h2>
            <p className="text-center mx-auto mb-5" style={{ maxWidth: '800px' }}>{tSchedule('description')}</p>
            <div className="schedule-table">
              <Schedule />
            </div>
          </div>
        </section>
        
        {/* Sponsors Marquee - Before FAQ section */}
        <section id="sponsors" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{tSponsors('title')}</h2>
            <Suspense fallback={<div className="carousel-loading">{t('loading')}</div>}>
              <MarqueeSlider 
                itemsType="sponsors" 
                items={sponsorItems}
              />
            </Suspense>
          </div>
        </section>

        {/* Interactive Map */}
        <section id="map" className="content-section">
          <div className="container text-center">
            <h2 className="section-header mb-4">{tLocation('title')}</h2>
            <div className="row mb-4">
              <div className="col-lg-10 mx-auto">
                <LocationInfo />
              </div>
            </div>
            <Suspense fallback={<div className="map-loading d-flex align-items-center justify-content-center py-5">
              <div className="text-center">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">{t('loading')}</span>
                </div>
                <p className="mt-2">{t('loading')}</p>
              </div>
            </div>}>
              <MapComponent />
            </Suspense>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{tFaq('title')}</h2>
            <FAQ />
          </div>
        </section>

        {/* Contact Form */}
        <section id="contact" className="content-section">
          <div className="container text-center">
            <h2 className="section-header">{tContact('title')}</h2>
            <p>{tContact('intro')}</p>
            <div className="row">
              <div className="col-lg-8 mx-auto">
                <ContactForm />
              </div>
            </div>
            <div className="mt-4">
              <ContactInfo />
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </>
  );
}
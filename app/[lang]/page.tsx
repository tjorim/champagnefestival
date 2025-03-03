import { Suspense } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { getCarouselItems, getFaqItems, getEventDetails, getDictionaryData } from '@/lib/data';

// Import UI components
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import BubbleBackground from '@/app/components/BubbleBackground';
import Countdown from '@/app/components/Countdown';
import Carousel from '@/app/components/Carousel';
import FAQ from '@/app/components/FAQ';
import MapComponent from '@/app/components/MapComponent';
import ContactForm from '@/app/components/ContactForm';

export default async function Home({ params }: { params: { lang: string } }) {
  // Get all data in parallel for the current language
  const [dict, producerItems, eventDetails] = await Promise.all([
    getDictionaryData(params.lang),
    getCarouselItems('producers'),
    // getEventDetails requires dict, so we'll get it separately
    getDictionaryData(params.lang).then(dict => getEventDetails(dict))
  ]);
  
  // Get FAQ items after we have the dictionary
  const faqItems = await getFaqItems(dict);
  
  return (
    <>
      <a href="#main-content" className="skip-link">
        {dict.accessibility.skipToContent}
      </a>
      <Header lang={params.lang} />
      <BubbleBackground />
      
      <main id="main-content">
        {/* Hero Section */}
        <section className="hero" id="home">
          <Container>
            <h1>{dict.festivalName} 2025</h1>
            <p className="hero-subtitle">
              {dict.welcome.subtitle}
            </p>
            <Countdown targetDate={eventDetails.dates.start} lang={params.lang} />
            <a href="#tickets" className="cta-button">
              {dict.welcome.learnMore}
            </a>
          </Container>
        </section>

        {/* About Section */}
        <section className="content-section" id="about">
          <Container>
            <h2 className="section-header">{dict.whatWeDo.title}</h2>
            <Row className="mt-4">
              <Col md={6}>
                <p>
                  {dict.whatWeDo.description}
                </p>
                <p>
                  {dict.whatWeDo.forEveryone}
                </p>
              </Col>
              <Col md={6}>
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
              </Col>
            </Row>
          </Container>
        </section>

        {/* Producers Section with Carousel */}
        <section className="content-section highlight-section" id="gallery">
          <Container>
            <h2 className="section-header">{dict.producers.title}</h2>
            <Suspense fallback={<div className="carousel-loading">{dict.loading}</div>}>
              <Carousel itemsType="producers" items={producerItems} />
            </Suspense>
          </Container>
        </section>

        {/* Venue Section with Map */}
        <section className="content-section" id="venue">
          <Container>
            <h2 className="section-header">{dict.location.title}</h2>
            <Row className="mt-4">
              <Col lg={6}>
                <h3>{dict.location.venueName}</h3>
                <p>
                  {dict.location.venueDescription}
                </p>
                <p>
                  <strong>{dict.location.address}:</strong> {dict.location.addressValue}
                </p>
                <p>
                  <strong>{dict.location.openingHours}:</strong> {dict.location.openingHoursValue}
                </p>
              </Col>
              <Col lg={6}>
                <Suspense fallback={<div className="map-loading">{dict.loading}</div>}>
                  <MapComponent address={eventDetails.location.address} />
                </Suspense>
              </Col>
            </Row>
          </Container>
        </section>

        {/* FAQ Section */}
        <section className="content-section highlight-section" id="faq">
          <Container>
            <h2 className="section-header">{dict.faq.title}</h2>
            <FAQ items={faqItems} />
          </Container>
        </section>

        {/* Contact Section with Form */}
        <section className="content-section" id="contact">
          <Container>
            <h2 className="section-header">{dict.contact.title}</h2>
            <Row className="mt-4">
              <Col md={6}>
                <p>
                  {dict.contact.intro}
                </p>
                <p>
                  {dict.contact.alternativeContact}
                </p>
                <p>
                  <strong>{dict.contact.emailLabel}:</strong> {dict.contact.emailValue}
                </p>
                <p>
                  <strong>{dict.contact.phoneLabel}:</strong> {dict.contact.phoneValue}
                </p>
              </Col>
              <Col md={6}>
                <ContactForm lang={params.lang} />
              </Col>
            </Row>
          </Container>
        </section>
      </main>
      
      <Footer lang={params.lang} />
    </>
  );
}
import { Suspense } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { getDictionary } from '@/get-dictionary';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Countdown from '@/app/components/Countdown';
import BubbleBackground from '@/app/components/BubbleBackground';
import Carousel from '@/app/components/Carousel';
import FAQ from '@/app/components/FAQ';
import MapComponent from '@/app/components/MapComponent';
import ContactForm from '@/app/components/ContactForm';

export default async function Home({ params }: { params: { lang: string } }) {
  const dict = await getDictionary(params.lang);
  
  return (
    <>
      <a href="#main-content" className="skip-link">
        {dict.accessibility.skipToContent}
      </a>
      <Header lang={params.lang} />
      <BubbleBackground />
      
      <main id="main-content">
        <section className="hero" id="home">
          <Container>
            <h1>{dict.festivalName} 2025</h1>
            <p className="hero-subtitle">
              {dict.welcome.subtitle}
            </p>
            <Countdown targetDate="2025-06-15T12:00:00" lang={params.lang} />
            <a href="#tickets" className="cta-button">
              {dict.welcome.learnMore}
            </a>
          </Container>
        </section>

        <section className="content-section" id="about">
          <Container>
            <h2 className="section-header">{dict.whatWeDo.title}</h2>
            <Row className="mt-4">
              <Col md={6}>
                <p>
                  {dict.whatWeDo.description}
                </p>
                <p>
                  {"Whether you're a champagne connoisseur or simply enjoy the occasional glass of bubbly, this festival offers something for everyone."}
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

        <section className="content-section highlight-section" id="gallery">
          <Container>
            <h2 className="section-header">{dict.producers.title}</h2>
            <Suspense fallback={<div className="carousel-loading">{dict.loading}</div>}>
              <Carousel />
            </Suspense>
          </Container>
        </section>

        <section className="content-section" id="venue">
          <Container>
            <h2 className="section-header">{dict.location.title}</h2>
            <Row className="mt-4">
              <Col lg={6}>
                <h3>Grand Exhibition Hall</h3>
                <p>
                  Located in the heart of the city, our venue offers a perfect blend
                  of elegance and accessibility. The Grand Exhibition Hall features 
                  state-of-the-art facilities with stunning architecture.
                </p>
                <p>
                  <strong>Address:</strong> 123 Festival Boulevard, City Center
                </p>
                <p>
                  <strong>Opening Hours:</strong> 11:00 AM - 8:00 PM
                </p>
              </Col>
              <Col lg={6}>
                <Suspense fallback={<div className="map-loading">{dict.loading}</div>}>
                  <MapComponent />
                </Suspense>
              </Col>
            </Row>
          </Container>
        </section>

        <section className="content-section highlight-section" id="faq">
          <Container>
            <h2 className="section-header">{dict.faq.title}</h2>
            <FAQ />
          </Container>
        </section>

        <section className="content-section" id="contact">
          <Container>
            <h2 className="section-header">{dict.contact.title}</h2>
            <Row className="mt-4">
              <Col md={6}>
                <p>
                  {dict.contact.intro}
                </p>
                <p>
                  Alternatively, you can reach us at:
                </p>
                <p>
                  <strong>Email:</strong> info@champagnefestival.com
                </p>
                <p>
                  <strong>Phone:</strong> +1 (555) 123-4567
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
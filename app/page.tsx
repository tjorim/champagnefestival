import { Suspense } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Countdown from '@/app/components/Countdown';
import BubbleBackground from '@/app/components/BubbleBackground';
import Carousel from '@/app/components/Carousel';
import FAQ from '@/app/components/FAQ';
import MapComponent from '@/app/components/MapComponent';
import ContactForm from '@/app/components/ContactForm';

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Header />
      <BubbleBackground />
      
      <main id="main-content">
        <section className="hero" id="home">
          <Container>
            <h1>Champagne Festival 2025</h1>
            <p className="hero-subtitle">
              Join us for the most exquisite champagne tasting experience
            </p>
            <Countdown targetDate="2025-06-15T12:00:00" />
            <a href="#tickets" className="cta-button">
              Get Tickets
            </a>
          </Container>
        </section>

        <section className="content-section" id="about">
          <Container>
            <h2 className="section-header">About The Festival</h2>
            <Row className="mt-4">
              <Col md={6}>
                <p>
                  The Annual Champagne Festival brings together the finest champagne 
                  producers from around the world. Experience a day of luxury, taste, 
                  and celebration as you sample exclusive champagnes, meet industry experts, 
                  and enjoy gourmet food pairings.
                </p>
                <p>
                  Whether you're a champagne connoisseur or simply enjoy the occasional 
                  glass of bubbly, this festival offers something for everyone.
                </p>
              </Col>
              <Col md={6}>
                <div className="features">
                  <div className="feature">
                    <h3>Premium Tastings</h3>
                    <p>Sample over 50 varieties of champagne from renowned producers</p>
                  </div>
                  <div className="feature">
                    <h3>Expert Sessions</h3>
                    <p>Learn from industry experts in our masterclass workshops</p>
                  </div>
                  <div className="feature">
                    <h3>Gourmet Experience</h3>
                    <p>Enjoy carefully curated food pairings from top local chefs</p>
                  </div>
                </div>
              </Col>
            </Row>
          </Container>
        </section>

        <section className="content-section highlight-section" id="gallery">
          <Container>
            <h2 className="section-header">Gallery</h2>
            <Suspense fallback={<div className="carousel-loading">Loading gallery...</div>}>
              <Carousel />
            </Suspense>
          </Container>
        </section>

        <section className="content-section" id="venue">
          <Container>
            <h2 className="section-header">Venue</h2>
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
                <Suspense fallback={<div className="map-loading">Loading map...</div>}>
                  <MapComponent />
                </Suspense>
              </Col>
            </Row>
          </Container>
        </section>

        <section className="content-section highlight-section" id="faq">
          <Container>
            <h2 className="section-header">Frequently Asked Questions</h2>
            <FAQ />
          </Container>
        </section>

        <section className="content-section" id="contact">
          <Container>
            <h2 className="section-header">Contact Us</h2>
            <Row className="mt-4">
              <Col md={6}>
                <p>
                  Have questions about the Champagne Festival? We're here to help! 
                  Fill out the form and our team will get back to you as soon as possible.
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
                <ContactForm />
              </Col>
            </Row>
          </Container>
        </section>
      </main>
      
      <Footer />
    </>
  );
}
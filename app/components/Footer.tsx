'use client';

import { useState } from "react";
import PrivacyPolicy from "./PrivacyPolicy";
import { Container, Row, Col, Button } from "react-bootstrap";
import { Dictionary } from "@/lib/i18n";
import { contactConfig } from "@/app/config/contact";

interface FooterProps {
    lang: string;
    dictionary: Dictionary;
}

const Footer = ({ lang, dictionary }: FooterProps) => {
    const currentYear = new Date().getFullYear();
    const [privacyOpen, setPrivacyOpen] = useState(false);

    return (
        <footer className="site-footer">
            <Container>
                <Row className="align-items-center mb-3">
                    <Col md={6} className="mb-3 mb-md-0 text-center text-md-start">
                        <p className="mb-0">
                            &copy; {currentYear} {dictionary.festivalName}. {dictionary.footer.rights}
                        </p>
                    </Col>
                    <Col md={6} className="text-center text-md-end">
                        <Button
                            onClick={() => setPrivacyOpen(true)}
                            variant="link"
                            className="text-white p-0 text-decoration-none footer-link me-3"
                        >
                            {dictionary.footer.privacy}
                        </Button>
                        {contactConfig.social.facebook && (
                            <a 
                                href={`https://www.facebook.com/${contactConfig.social.facebook}`} 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white text-decoration-none ms-2"
                                aria-label="Facebook"
                            >
                                <i className="bi bi-facebook"></i>
                            </a>
                        )}
                    </Col>
                </Row>
            </Container>

            {/* Privacy Policy Modal */}
            <PrivacyPolicy
                isOpen={privacyOpen}
                onClose={() => setPrivacyOpen(false)}
                lang={lang}
                dictionary={dictionary}
            />
        </footer>
    );
};

export default Footer;
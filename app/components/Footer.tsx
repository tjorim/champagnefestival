'use client';

import { useState } from "react";
import { useTranslation } from "react-i18next";
import PrivacyPolicy from "./PrivacyPolicy";
import { Container, Row, Col, Button } from "react-bootstrap";

const Footer = () => {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const [privacyOpen, setPrivacyOpen] = useState(false);

    return (
        <footer className="site-footer">
            <Container>
                <Row className="align-items-center">
                    <Col md={6} className="mb-3 mb-md-0 text-center text-md-start">
                        <p className="mb-0">
                            &copy; {currentYear} {t("festivalName", "Champagne Festival")}. {t("footer.rights", "All rights reserved.")}
                        </p>
                    </Col>
                    <Col md={6} className="text-center text-md-end">
                        <Button
                            onClick={() => setPrivacyOpen(true)}
                            variant="link"
                            className="text-white p-0 text-decoration-none footer-link"
                        >
                            {t("footer.privacy", "Privacy Policy")}
                        </Button>
                    </Col>
                </Row>
            </Container>

            {/* Privacy Policy Modal */}
            <PrivacyPolicy
                isOpen={privacyOpen}
                onClose={() => setPrivacyOpen(false)}
            />
        </footer>
    );
};

export default Footer;
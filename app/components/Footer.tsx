'use client';

import { useState, useEffect } from "react";
import PrivacyPolicy from "./PrivacyPolicy";
import { Container, Row, Col, Button } from "react-bootstrap";
import { getDictionary } from "@/get-dictionary";

interface FooterProps {
    lang: string;
}

const Footer = ({ lang }: FooterProps) => {
    const currentYear = new Date().getFullYear();
    const [privacyOpen, setPrivacyOpen] = useState(false);
    const [dictionary, setDictionary] = useState<any>({});
    
    // Load dictionary on client side
    useEffect(() => {
        const loadDictionary = async () => {
            const dict = await getDictionary(lang);
            setDictionary(dict);
        };
        
        loadDictionary();
    }, [lang]);

    return (
        <footer className="site-footer">
            <Container>
                <Row className="align-items-center">
                    <Col md={6} className="mb-3 mb-md-0 text-center text-md-start">
                        <p className="mb-0">
                            &copy; {currentYear} {dictionary.festivalName || "Champagne Festival"}. {dictionary.footer?.rights || "All rights reserved."}
                        </p>
                    </Col>
                    <Col md={6} className="text-center text-md-end">
                        <Button
                            onClick={() => setPrivacyOpen(true)}
                            variant="link"
                            className="text-white p-0 text-decoration-none footer-link"
                        >
                            {dictionary.footer?.privacy || "Privacy Policy"}
                        </Button>
                    </Col>
                </Row>
            </Container>

            {/* Privacy Policy Modal */}
            <PrivacyPolicy
                isOpen={privacyOpen}
                onClose={() => setPrivacyOpen(false)}
                lang={lang}
            />
        </footer>
    );
};

export default Footer;
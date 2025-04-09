import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import PrivacyPolicy from "./PrivacyPolicy";

const Footer = () => {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const [privacyOpen, setPrivacyOpen] = useState(false);
    
    // Open the privacy policy modal if the URL has #privacy-policy
    useEffect(() => {
        if (window.location.hash === '#privacy-policy') {
            setPrivacyOpen(true);
        }
        
        // Listen for hash changes
        const handleHashChange = () => {
            if (window.location.hash === '#privacy-policy') {
                setPrivacyOpen(true);
            }
        };
        
        window.addEventListener('hashchange', handleHashChange);
        
        // Clean up event listener
        return () => {
            window.removeEventListener('hashchange', handleHashChange);
        };
    }, []);

    return (
        <footer
            className="site-footer"
        >
            <div className="container">
                <div className="row align-items-center">
                    <div className="col-md-6 mb-3 mb-md-0 text-center text-md-start">
                        <p className="mb-0">
                            &copy; {currentYear} {t("festivalName", "Champagne Festival")}. {t("footer.rights", "All rights reserved.")}
                        </p>
                    </div>
                    <div className="col-md-6 text-center text-md-end">
                        <a
                            href="#privacy-policy"
                            onClick={(e) => {
                                e.preventDefault();
                                // Set a small timeout to ensure scroll position doesn't jump
                                setTimeout(() => {
                                    setPrivacyOpen(true);
                                }, 0);
                            }}
                            className="btn btn-link text-white p-0 text-decoration-none footer-link"
                        >
                            {t("footer.privacy", "Privacy Policy")}
                        </a>
                    </div>
                </div>
            </div>

            {/* Privacy Policy Modal */}
            <PrivacyPolicy
                isOpen={privacyOpen}
                onClose={() => setPrivacyOpen(false)}
            />
        </footer>
    );
};

export default Footer;

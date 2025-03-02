import { useState } from "react";
import { useTranslation } from "react-i18next";
import PrivacyPolicy from "./PrivacyPolicy";

const Footer = () => {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const [privacyOpen, setPrivacyOpen] = useState(false);

    return (
        <footer
            role="contentinfo"
            style={{
                background: "linear-gradient(to right, rgba(67, 56, 202, 0.7), rgba(126, 34, 206, 0.7))",
                color: "white",
                padding: "1.5rem 0",
                marginTop: "2rem",
                borderTop: "1px solid rgba(255, 255, 255, 0.1)"
            }}
        >
            <div className="container">
                <div className="row align-items-center">
                    <div className="col-md-6 mb-3 mb-md-0 text-center text-md-start">
                        <p className="mb-0">
                            &copy; {currentYear} {t("festivalName", "Champagne Festival")}. {t("footer.rights", "All rights reserved.")}
                        </p>
                    </div>
                    <div className="col-md-6 text-center text-md-end">
                        <button
                            onClick={() => setPrivacyOpen(true)}
                            className="btn btn-link text-white p-0 text-decoration-none footer-link"
                        >
                            {t("footer.privacy", "Privacy Policy")}
                        </button>
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

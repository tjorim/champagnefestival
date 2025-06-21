import { useState } from "react";
import { useTranslation } from "react-i18next";
import PrivacyPolicy from "./PrivacyPolicy";

const Footer = () => {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const [privacyOpen, setPrivacyOpen] = useState(false);

    // Privacy policy modal is handled via direct button clicks, no URL hash needed

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

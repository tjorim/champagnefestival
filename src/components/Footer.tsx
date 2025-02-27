import React from "react";
import { useTranslation } from "react-i18next";

const Footer = () => {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    
    return (
        <footer role="contentinfo" className="bg-gradient-to-r from-indigo-900 to-purple-800 text-white py-6 mt-8">
            <div className="container">
                <div className="flex flex-col md:flex-row justify-between items-center">
                    <p className="mb-4 md:mb-0">
                        &copy; {currentYear} {t("festivalName", "Champagne Festival")}. {t("footer.rights", "All rights reserved.")}
                    </p>
                    <div className="flex space-x-4">
                        <a href="#" className="text-white hover:text-gray-300 transition">
                            {t("footer.privacy", "Privacy Policy")}
                        </a>
                        <a href="#" className="text-white hover:text-gray-300 transition">
                            {t("footer.terms", "Terms of Service")}
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;

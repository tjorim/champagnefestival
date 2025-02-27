import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import PrivacyPolicy from "./PrivacyPolicy";

const Footer = () => {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const [privacyOpen, setPrivacyOpen] = useState(false);

    return (
        <footer role="contentinfo" className="bg-gradient-to-r from-indigo-900 to-purple-800 text-white py-6 mt-8">
            <div className="container">
                <div className="flex flex-col md:flex-row justify-between items-center">
                    <p className="mb-4 md:mb-0">
                        &copy; {currentYear} {t("festivalName", "Champagne Festival")}. {t("footer.rights", "All rights reserved.")}
                    </p>
                    <div className="flex space-x-4">
                        <button 
                            onClick={() => setPrivacyOpen(true)} 
                            className="text-white hover:text-gray-200 transition-colors bg-transparent border-none p-0 cursor-pointer font-normal"
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

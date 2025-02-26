import React from "react";
import { useTranslation } from "react-i18next";

const Footer = () => {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    
    return (
        <footer role="contentinfo">
            <div className="container">
                <p>
                    &copy; {currentYear} {t("festivalName", "Champagne Festival")}. All rights reserved.
                </p>
            </div>
        </footer>
    );
};

export default Footer;

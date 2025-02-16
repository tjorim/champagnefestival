import React from "react";
import { useTranslation } from "react-i18next";

const Header = () => {
    const { t } = useTranslation();
    return (
        <header>
            <h1>{t("festivalName", "Champagne Festival")}</h1>
            <nav>
                <a href="#what-we-do">{t("whatWeDo.title", "What We Do")}</a>
                <a href="#next-festival">{t("nextFestival.title", "Next Festival")}</a>
                <a href="#schedule">{t("schedule", "Schedule")}</a>
                <a href="#map">{t("location", "Location")}</a>
                <a href="#faq">{t("faq", "FAQ")}</a>
                <a href="#contact">{t("contact", "Contact")}</a>
            </nav>
        </header>
    );
};

export default Header;

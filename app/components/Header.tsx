import React from 'react';
import { NavigationMenu } from "radix-ui";
import { useTranslation } from "react-i18next";
import { Link } from 'react-router';

const Header = () => {
    const { t } = useTranslation();

    return (
        <NavigationMenu.Root className="navigation-root">
            <NavigationMenu.List className="navigation-list">
                <NavigationMenu.Item className="navigation-item">
                    <Link to="#what-we-do">{t("whatWeDo.title", "What We Do")}</Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item className="navigation-item">
                    <Link to="#next-festival">{t("nextFestival.title", "Next Festival")}</Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item className="navigation-item">
                    <Link to="#schedule">{t("schedule", "Schedule")}</Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item className="navigation-item">
                    <Link to="#map">{t("location", "Location")}</Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item className="navigation-item">
                    <Link to="#faq">{t("faq", "FAQ")}</Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item className="navigation-item">
                    <Link to="#contact">{t("contact", "Contact")}</Link>
                </NavigationMenu.Item>
            </NavigationMenu.List>
        </NavigationMenu.Root>
    );
};

export default Header;

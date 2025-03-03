'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown, Button } from "react-bootstrap";

const LanguageSwitcher = () => {
    const { i18n, t } = useTranslation();
    const currentLang = i18n.language;
    const [preventHydrationIssue, setPreventHydrationIssue] = useState(false);

    // Prevent hydration issues by not rendering on first mount
    useEffect(() => {
        setPreventHydrationIssue(true);
    }, []);

    // Language definitions
    const languages = [
        { code: 'en', label: 'English', flag: '🇬🇧', nativeName: 'English' },
        { code: 'nl', label: 'Dutch', flag: '🇳🇱', nativeName: 'Nederlands' },
        { code: 'fr', label: 'French', flag: '🇫🇷', nativeName: 'Français' },
    ];

    // Find current language details
    const currentLanguage = languages.find(lang => lang.code === currentLang) || languages[0];

    // Handle language change
    const changeLanguage = (langCode: string) => {
        i18n.changeLanguage(langCode);
    };

    // Don't render anything during server-side rendering to prevent hydration issues
    if (!preventHydrationIssue) {
        return <div className="mr-4"></div>;
    }

    return (
        <Dropdown>
            <Dropdown.Toggle
                as={Button}
                variant="dark"
                size="sm"
                className="text-secondary"
                aria-label="Language selection"
                title={t("language.select", "Select language")}
            >
                <i className="bi bi-globe2"></i>
                <span className="d-none d-sm-inline ms-2">{currentLanguage.code.toUpperCase()}</span>
                {/* Bootstrap dropdown toggle already includes a chevron */}
            </Dropdown.Toggle>

            <Dropdown.Menu
                className="min-width-220"
                align="end"
            >
                {languages.map((lang) => (
                    <Dropdown.Item
                        key={lang.code}
                        className={`d-flex align-items-center px-4 py-3 ${currentLang === lang.code ? "bg-primary bg-opacity-10" : ""
                            }`}
                        onClick={() => changeLanguage(lang.code)}
                    >
                        <span className="me-3 fs-5">{lang.flag}</span>
                        <div>
                            <div className="fw-medium">{lang.label}</div>
                            <div className="small text-muted">{lang.nativeName}</div>
                        </div>
                        {currentLang === lang.code && (
                            <i className="bi bi-check ms-auto text-primary"></i>
                        )}
                    </Dropdown.Item>
                ))}
            </Dropdown.Menu>
        </Dropdown>
    );
};

export default LanguageSwitcher;
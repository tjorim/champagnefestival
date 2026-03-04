import { useState, useEffect } from 'react';
import { getLocale, setLocale, isLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';
import { Dropdown, Button } from "react-bootstrap";

const LanguageSwitcher = () => {
    const [preventHydrationIssue, setPreventHydrationIssue] = useState(false);
    const [currentLang, setCurrentLang] = useState(getLocale());

    // Prevent hydration issues by not rendering on first mount
    useEffect(() => {
        setPreventHydrationIssue(true);
    }, []);

    // Language definitions
    const languages = [
        { code: 'en', label: 'English', flag: '🇬🇧', nativeName: 'English' },
        { code: 'nl', label: 'Dutch', flag: '🇳🇱', nativeName: 'Nederlands' },
        { code: 'fr', label: 'French', flag: '🇫🇷', nativeName: 'Français' },
    ] as const;

    // Find current language details
    const currentLanguage = languages.find(lang => lang.code === currentLang)
        ?? { code: 'nl', label: 'Dutch', flag: '🇳🇱', nativeName: 'Nederlands' };

    // Handle language change
    const changeLanguage = (langCode: string) => {
        if (isLocale(langCode)) {
            setLocale(langCode);
            setCurrentLang(langCode);
        }
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
                title={m.language_select()}
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
                        as="button"
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

'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Dropdown, Button } from "react-bootstrap";
import { languages } from '@/lib/i18n';

interface LanguageSwitcherProps {
    currentLang: string;
}

const LanguageSwitcher = ({ currentLang }: LanguageSwitcherProps) => {
    const [mounted, setMounted] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    // Prevent hydration issues by not rendering on first mount
    useEffect(() => {
        setMounted(true);
    }, []);

    // Language definitions
    const languageOptions = [
        { code: 'en', label: 'English', flag: '🇬🇧', nativeName: 'English' },
        { code: 'nl', label: 'Dutch', flag: '🇳🇱', nativeName: 'Nederlands' },
        { code: 'fr', label: 'French', flag: '🇫🇷', nativeName: 'Français' },
    ];

    // Find current language details
    const currentLanguageOption = languageOptions.find(lang => lang.code === currentLang) || languageOptions[0];

    // Handle language change - redirects to the same page with a different locale
    const changeLanguage = (langCode: string) => {
        const newPathname = pathname.replace(/^\/[^\/]+/, `/${langCode}`);
        router.push(newPathname);
        
        // Set cookie for language preference
        document.cookie = `NEXT_LOCALE=${langCode}; path=/; max-age=31536000; SameSite=Lax`;
    };

    // Don't render anything during server-side rendering to prevent hydration issues
    if (!mounted) {
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
                title="Select language"
            >
                <i className="bi bi-globe2"></i>
                <span className="d-none d-sm-inline ms-2">{currentLanguageOption.code.toUpperCase()}</span>
            </Dropdown.Toggle>

            <Dropdown.Menu
                className="min-width-220"
                align="end"
            >
                {languageOptions.map((lang) => (
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
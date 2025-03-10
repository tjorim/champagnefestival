'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Dropdown, Button } from "react-bootstrap";
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { Link } from 'next-intl/link';

interface LanguageSwitcherProps {
    currentLang: string;
}

const LanguageSwitcher = ({ currentLang }: LanguageSwitcherProps) => {
    const [mounted, setMounted] = useState(false);
    const t = useTranslations();
    const locale = useLocale();
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
                aria-label={t('language.select')}
                title={t('language.select')}
            >
                <i className="bi bi-globe2"></i>
                <span className="d-none d-sm-inline ms-2">{currentLanguageOption.code.toUpperCase()}</span>
            </Dropdown.Toggle>

            <Dropdown.Menu
                className="min-width-220"
                align="end"
            >
                {languageOptions.map((lang) => (
                    <Link 
                        key={lang.code}
                        href={pathname} 
                        locale={lang.code}
                        className="dropdown-item d-flex align-items-center px-4 py-3"
                        style={currentLang === lang.code ? {background: 'rgba(var(--bs-primary-rgb), 0.1)'} : {}}
                    >
                        <span className="me-3 fs-5">{lang.flag}</span>
                        <div>
                            <div className="fw-medium">{lang.label}</div>
                            <div className="small text-muted">{lang.nativeName}</div>
                        </div>
                        {currentLang === lang.code && (
                            <i className="bi bi-check ms-auto text-primary"></i>
                        )}
                    </Link>
                ))}
            </Dropdown.Menu>
        </Dropdown>
    );
};

export default LanguageSwitcher;
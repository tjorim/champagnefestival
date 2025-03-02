// LanguageSwitcher.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, ChevronDown } from "lucide-react";
import { Dropdown, Button } from "react-bootstrap";
import { cn } from "@/lib/utils";

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
                className="text-neutral-300 hover:text-white hover:bg-neutral-800/60"
                title={t("language.select", "Select language")}
            >
                <Globe className="h-3 w-3" />
                <span className="d-none d-sm-inline ms-2">{currentLanguage.code.toUpperCase()}</span>
                <ChevronDown className="w-3 h-3 ms-1 opacity-70" />
            </Dropdown.Toggle>

            <Dropdown.Menu 
                className="min-w-[220px]" 
                align="end"
            >
                {languages.map((lang) => (
                    <Dropdown.Item
                        key={lang.code}
                        className={cn(
                            "d-flex align-items-center px-4 py-3",
                            currentLang === lang.code && "bg-primary/10"
                        )}
                        onClick={() => changeLanguage(lang.code)}
                    >
                        <span className="me-3 text-lg">{lang.flag}</span>
                        <div>
                            <div className="fw-medium">{lang.label}</div>
                            <div className="text-xs text-muted">{lang.nativeName}</div>
                        </div>
                        {currentLang === lang.code && (
                            <Check className="ms-auto h-3 w-3 text-primary" />
                        )}
                    </Dropdown.Item>
                ))}
            </Dropdown.Menu>
        </Dropdown>
    );
};

export default LanguageSwitcher;

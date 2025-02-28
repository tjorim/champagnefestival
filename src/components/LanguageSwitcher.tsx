// LanguageSwitcher.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { GlobeAltIcon } from '@heroicons/react/24/outline';

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
        <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-300 rounded-md hover:text-white hover:bg-gray-800/60 transition-colors"
                    title={t("language.select", "Select language")}
                >
                    <GlobeAltIcon className="h-3 w-3" />
                    <span className="hidden sm:inline ml-2">{currentLanguage.code.toUpperCase()}</span>
                    <svg className="w-3 h-3 ml-1 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className="min-w-[220px] max-w-[90vw] bg-gray-900 rounded-md p-1 shadow-lg border border-gray-700 will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade z-50"
                    sideOffset={5}
                    align="end"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    {languages.map((lang) => (
                        <DropdownMenu.Item
                            key={lang.code}
                            className={`flex items-center px-4 py-3 rounded-sm outline-none text-sm ${
                                currentLang === lang.code 
                                    ? 'bg-indigo-500/10 text-indigo-300 font-medium' 
                                    : 'text-gray-300 hover:bg-gray-800 focus:bg-gray-800 cursor-pointer'
                            } transition-colors`}
                            onSelect={() => changeLanguage(lang.code)}
                        >
                            <span className="mr-3 text-lg">{lang.flag}</span>
                            <div>
                                <div className="font-medium">{lang.label}</div>
                                <div className="text-xs text-gray-500">{lang.nativeName}</div>
                            </div>
                            {currentLang === lang.code && (
                                <svg className="ml-auto h-3 w-3 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            )}
                        </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
};

export default LanguageSwitcher;

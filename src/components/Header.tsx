import React from 'react';
import { useTranslation } from 'react-i18next';
import { HomeIcon } from '@heroicons/react/24/outline';
import LanguageSwitcher from './LanguageSwitcher';

interface HeaderProps {
    logoSrc?: string;
}

const Header = ({ logoSrc = "/images/logo.svg" }: HeaderProps) => {
    const { t } = useTranslation();

    return (
        <header className="fixed top-0 left-0 w-full bg-gray-900 text-white shadow-xl z-50">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900 to-indigo-900/20"></div>
            <div className="container mx-auto px-4 flex items-center justify-between h-16 relative z-10">
                {/* Logo / Title */}
                <div className="flex items-center">
                    <a href="#welcome" className="flex items-center space-x-2 group">
                        <img src={logoSrc} alt="Logo" className="h-9 w-9" />
                        <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 group-hover:from-indigo-300 group-hover:to-purple-400 transition-all">
                            {t("festivalName", "Champagne Festival")}
                        </span>
                    </a>
                    <a
                        href="#welcome"
                        className="ml-3 p-1.5 rounded-full bg-gray-800/50 hover:bg-gray-800 transition-colors flex"
                        aria-label="Back to top"
                        title={t("navigation.home", "Home")}
                    >
                        <HomeIcon className="h-4 w-4 text-indigo-300" />
                    </a>
                </div>

                {/* Language Switcher */}
                <div className="flex items-center">
                    <LanguageSwitcher />
                </div>
            </div>
        </header>
    );
};

export default Header;

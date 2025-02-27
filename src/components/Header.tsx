import React from 'react';
import { useTranslation } from 'react-i18next';
import { HomeIcon } from '@heroicons/react/24/outline';
import LanguageSwitcher from './LanguageSwitcher';
import { mainNavLinks } from '../config/navigation';

interface HeaderProps {
    logoSrc?: string;
}

const Header = ({ logoSrc = "/images/logo.svg" }: HeaderProps) => {
    const { t } = useTranslation();

    const navLinks = mainNavLinks.map(link => ({
        ...link,
        label: t(link.labelKey, link.defaultLabel)
    }));

    return (
        <header style={{ zIndex: 'var(--header-z-index)' }} className="fixed top-0 left-0 w-full bg-gray-900 text-white shadow-xl">
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
                        className="ml-3 p-1.5 rounded-full bg-gray-800/50 hover:bg-gray-800 transition-colors hidden sm:flex"
                        aria-label="Back to top"
                        title={t("navigation.home", "Home")}
                    >
                        <HomeIcon className="h-3 w-3 text-indigo-300" />
                    </a>
                </div>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex space-x-4">
                    {navLinks.map((link, index) => (
                        <a
                            key={index}
                            href={link.href}
                            className="text-gray-300 hover:text-white px-3 py-2 relative group transition-colors"
                        >
                            {link.label}
                            <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-500 group-hover:w-full transition-all duration-300"></span>
                        </a>
                    ))}
                </nav>

                {/* Language Switcher */}
                <div className="flex items-center">
                    <LanguageSwitcher />
                </div>
            </div>
        </header>
    );
};

export default Header;

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import LanguageSwitcher from './LanguageSwitcher';

const Header = () => {
    const { t } = useTranslation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const navLinks = [
        { label: t("whatWeDo.title", "What We Do"), href: "#what-we-do" },
        { label: t("nextFestival.title", "Next Festival"), href: "#next-festival" },
        { label: t("schedule", "Schedule"), href: "#schedule" },
        { label: t("location", "Location"), href: "#map" },
        { label: t("faq", "FAQ"), href: "#faq" },
        { label: t("contact", "Contact"), href: "#contact" },
    ];

    return (
        <header className="fixed top-0 left-0 w-full z-50 bg-indigo-900 text-white shadow-lg">
            <div className="container mx-auto px-4 flex items-center justify-between h-16">
                {/* Logo / Title */}
                <div className="flex items-center space-x-4">
                    <div className="text-xl font-bold">
                        {t("festivalName", "Champagne Festival")}
                    </div>
                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex space-x-4">
                        {navLinks.map((link, index) => (
                            <Link
                                key={index}
                                to={link.href}
                                className="hover:bg-indigo-800 px-3 py-2 rounded transition"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                </div>
                {/* Right-Side Controls */}
                <div className="flex items-center space-x-4">
                    <LanguageSwitcher />
                    {/* Mobile Menu Toggle */}
                    <div className="md:hidden">
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Toggle Menu"
                        >
                            {mobileMenuOpen ? (
                                <XMarkIcon className="h-6 w-6" />
                            ) : (
                                <Bars3Icon className="h-6 w-6" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
            {/* Mobile Navigation Menu */}
            {mobileMenuOpen && (
                <nav className="md:hidden bg-indigo-900">
                    <div className="px-4 pb-4 space-y-2">
                        {navLinks.map((link, index) => (
                            <Link
                                key={index}
                                to={link.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className="block hover:bg-indigo-800 px-3 py-2 rounded transition"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </nav>
            )}
        </header>
    );
};

export default Header;

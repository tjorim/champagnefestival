import React from 'react';
import { useTranslation } from 'react-i18next';
import { Home } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HeaderProps {
    logoSrc?: string;
}

const Header = ({ logoSrc = "/images/logo.svg" }: HeaderProps) => {
    const { t } = useTranslation();

    return (
        <header className="fixed top-0 left-0 w-full bg-neutral-950 text-white shadow-xl z-50">
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950 to-neutral-800/20"></div>
            <div className="container mx-auto px-4 flex items-center justify-between h-16 relative z-10">
                {/* Logo / Title */}
                <div className="flex items-center">
                    <a href="#welcome" className="flex items-center space-x-2 group">
                        <img src={logoSrc} alt="Logo" className="h-9 w-9" />
                        <span className={cn(
                            "text-xl font-bold text-transparent bg-clip-text",
                            "bg-gradient-to-r from-indigo-400 to-purple-500",
                            "group-hover:from-indigo-300 group-hover:to-purple-400 transition-all"
                        )}>
                            {t("festivalName", "Champagne Festival")}
                        </span>
                    </a>
                    <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="ml-3 text-indigo-300 hover:text-indigo-200 hover:bg-neutral-800"
                    >
                        <a
                            href="#welcome"
                            aria-label="Back to top"
                            title={t("navigation.home", "Home")}
                        >
                            <Home className="h-4 w-4" />
                        </a>
                    </Button>
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

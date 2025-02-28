// LanguageSwitcher.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-neutral-300 hover:text-white hover:bg-neutral-800/60"
                    title={t("language.select", "Select language")}
                >
                    <Globe className="h-3 w-3" />
                    <span className="hidden sm:inline ml-2">{currentLanguage.code.toUpperCase()}</span>
                    <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent 
                className="min-w-[220px]" 
                align="end"
                sideOffset={5}
            >
                {languages.map((lang) => (
                    <DropdownMenuItem
                        key={lang.code}
                        className={cn(
                            "flex items-center px-4 py-3 cursor-pointer",
                            currentLang === lang.code && "bg-primary/10"
                        )}
                        onSelect={() => changeLanguage(lang.code)}
                    >
                        <span className="mr-3 text-lg">{lang.flag}</span>
                        <div>
                            <div className="font-medium">{lang.label}</div>
                            <div className="text-xs text-muted-foreground">{lang.nativeName}</div>
                        </div>
                        {currentLang === lang.code && (
                            <Check className="ml-auto h-3 w-3 text-primary" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default LanguageSwitcher;

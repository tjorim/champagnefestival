import { Globe, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { getLocale, setLocale, isLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";

const LanguageSwitcher = () => {
  const [preventHydrationIssue, setPreventHydrationIssue] = useState(false);
  const [currentLang, setCurrentLang] = useState(getLocale());

  // Prevent hydration issues by not rendering on first mount
  useEffect(() => {
    setPreventHydrationIssue(true);
  }, []);

  // Language definitions
  const languages = [
    { code: "en", label: "English", flag: "🇬🇧", nativeName: "English" },
    { code: "nl", label: "Dutch", flag: "🇳🇱", nativeName: "Nederlands" },
    { code: "fr", label: "French", flag: "🇫🇷", nativeName: "Français" },
  ] as const;

  // Find current language details
  const currentLanguage = languages.find((lang) => lang.code === currentLang) ?? {
    code: "nl",
    label: "Dutch",
    flag: "🇳🇱",
    nativeName: "Nederlands",
  };

  // Handle language change
  const changeLanguage = (langCode: string) => {
    if (isLocale(langCode)) {
      setLocale(langCode);
      setCurrentLang(langCode);
    }
  };

  // Don't render anything during server-side rendering to prevent hydration issues
  if (!preventHydrationIssue) {
    return <div className="tw:mr-4" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-tailwind-migrated="true"
        className="site-lang-toggle tw:inline-flex tw:items-center tw:gap-2 tw:rounded tw:border tw:px-2 tw:py-1 tw:text-sm"
        aria-label={m.language_select()}
        title={m.language_select()}
      >
        <Globe aria-hidden="true" className="tw:size-4" />
        <span className="tw:hidden tw:sm:inline">{currentLanguage.code.toUpperCase()}</span>
        <ChevronDown aria-hidden="true" className="tw:size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent admin={false} align="end" className="tw:min-w-56">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className="tw:gap-3 tw:px-4 tw:py-3"
          >
            <span className="tw:text-xl" aria-hidden="true">
              {lang.flag}
            </span>
            <div>
              <div className="tw:font-medium">{lang.label}</div>
              <div className="tw:text-xs tw:text-muted-foreground tw:group-data-highlighted/dropdown-menu-item:text-accent-foreground">
                {lang.nativeName}
              </div>
            </div>
            {currentLang === lang.code && (
              <Check
                aria-hidden="true"
                className="tw:ml-auto tw:size-4 tw:text-primary tw:group-data-highlighted/dropdown-menu-item:text-accent-foreground"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;

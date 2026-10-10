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
    { code: "en", flag: "🇬🇧", nativeName: "English" },
    { code: "nl", flag: "🇳🇱", nativeName: "Nederlands" },
    { code: "fr", flag: "🇫🇷", nativeName: "Français" },
  ] as const;

  // Find current language details
  const currentLanguage = languages.find((lang) => lang.code === currentLang) ?? {
    code: "nl",
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
    return <div className="mr-4" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="site-lang-toggle inline-flex items-center gap-2 rounded border px-2 py-1 text-sm"
        aria-label={m.language_select()}
        title={m.language_select()}
      >
        <Globe aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">{currentLanguage.code.toUpperCase()}</span>
        <ChevronDown aria-hidden="true" className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent admin={false} align="end" className="min-w-56">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className="gap-3 px-4 py-3"
          >
            <span className="text-xl" aria-hidden="true">
              {lang.flag}
            </span>
            <div>
              <div className="font-medium">
                {new Intl.DisplayNames([getLocale()], { type: "language" }).of(lang.code)}
              </div>
              <div className="text-xs text-muted-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground">
                {lang.nativeName}
              </div>
            </div>
            {currentLang === lang.code && (
              <Check
                aria-hidden="true"
                className="ml-auto size-4 text-primary group-data-highlighted/dropdown-menu-item:text-accent-foreground"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;

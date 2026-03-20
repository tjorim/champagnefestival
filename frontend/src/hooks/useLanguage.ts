import { useEffect } from "react";
import { getLocale } from "@/paraglide/runtime";

/**
 * Custom hook to handle language settings and HTML attributes.
 * Updates the HTML lang attribute based on the current Paraglide locale.
 */
export function useLanguage() {
  useEffect(() => {
    // Language changes reload the page (Paraglide default), so this only
    // needs to run once on mount to set the initial locale.
    document.documentElement.lang = getLocale();
  }, []);
}

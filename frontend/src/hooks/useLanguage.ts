import { useEffect } from "react";
import { getLocale, overwriteSetLocale, setLocale } from "@/paraglide/runtime";

const listeners = new Set<() => void>();

// Paraglide has no change event. Wrapping `setLocale` once lets the document language follow
// `{ reload: false }` changes (the language menu persists, then navigates) without polling.
const persistLocale = setLocale;
overwriteSetLocale((newLocale, options) => {
  const result = persistLocale(newLocale, options);
  listeners.forEach((listener) => listener());
  return result;
});

/**
 * Keeps `<html lang>` aligned with the interface language Paraglide resolves, so assistive
 * technology pronounces the rendered text in the right language. `index.html` ships `nl`
 * (the base locale crawlers see); this corrects it after mount and on every locale change.
 */
export function useLanguage() {
  useEffect(() => {
    const sync = () => {
      document.documentElement.lang = getLocale();
    };
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
}

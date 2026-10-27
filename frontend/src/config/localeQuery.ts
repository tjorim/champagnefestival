import { defineCustomClientStrategy, isLocale } from "@/paraglide/runtime";

/** The query parameter the site advertises per language (hreflang links, sitemap, backend render). */
export const LOCALE_QUERY_PARAM = "lng";

/**
 * Makes `/?lng=fr` open in French. The hreflang alternates and the server-rendered metadata
 * already promise that, so a crawler or a shared link must get the same language in the app.
 * It runs first in the strategy order (vite.config.ts); without the parameter the saved choice,
 * then the browser language, apply as before.
 */
defineCustomClientStrategy("custom-queryParam", {
  getLocale: () => {
    const value = new URLSearchParams(window.location.search).get(LOCALE_QUERY_PARAM);
    return isLocale(value) ? value : undefined;
  },
  // Switching language reloads the page: keep an explicit parameter in step, or it would win
  // over the new choice. Pages opened without one are left alone (the choice is saved instead).
  setLocale: (locale) => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(LOCALE_QUERY_PARAM)) return;
    url.searchParams.set(LOCALE_QUERY_PARAM, locale);
    window.history.replaceState(window.history.state, "", url);
  },
});

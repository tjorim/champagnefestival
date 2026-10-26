import { defineCustomClientStrategy, type Locale } from "@/paraglide/runtime";

/** Only the public home and privacy documents have locale-prefixed routes. */
export function pathLocale(pathname: string): Locale | undefined {
  return /^\/(en|fr)(?:\/privacy)?\/?$/.exec(pathname)?.[1] as Locale | undefined;
}

export function localizedPublicPath(pathname: string, locale: Locale): string {
  const unprefixed = pathname.replace(/^\/(en|fr)(?=\/|$)/, "").replace(/\/$/, "") || "/";
  if (unprefixed !== "/" && unprefixed !== "/privacy") return pathname;
  return locale === "nl" ? unprefixed : `/${locale}${unprefixed === "/" ? "" : unprefixed}`;
}

// Unprefixed pages retain the saved/browser-language fallback. Explicit paths win.
defineCustomClientStrategy("custom-localePath", {
  getLocale: () => pathLocale(window.location.pathname),
  // The switcher owns document navigation; initial locale resolution must not rewrite the URL.
  setLocale: () => {},
});

export function localizedPublicUrl(href: string, locale: Locale): URL {
  const url = new URL(href);
  url.pathname = localizedPublicPath(url.pathname, locale);
  return url;
}

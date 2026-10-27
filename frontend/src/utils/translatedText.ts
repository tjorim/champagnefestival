import type { Locale } from "@/paraglide/runtime";

export type TranslatedText = { text: string; lang: Locale | undefined };

/**
 * Picks a visitor-content translation for the interface language, falling back to Dutch.
 * `lang` is only set when the text is in a different language than the interface, so spread it
 * onto the element that renders it (`<p lang={lang}>`): screen readers then switch voice for
 * the Dutch fallback without the interface language, or the fallback policy, changing.
 */
export function pickTranslation(
  translations: Record<Locale, string | null | undefined>,
  locale: string,
): TranslatedText | null {
  const own = locale in translations ? translations[locale as Locale]?.trim() : null;
  if (own) return { text: own, lang: undefined };
  const dutch = translations.nl?.trim();
  return dutch ? { text: dutch, lang: locale === "nl" ? undefined : "nl" } : null;
}

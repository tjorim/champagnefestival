import type { EventLanguage, EventTranslations } from "@/types/event";

type EventText = Pick<EventTranslations, "titleLanguage" | "descriptionLanguage"> &
  Partial<EventTranslations> & { title: string; description: string };

function isLanguage(locale: string): locale is EventLanguage {
  return locale === "nl" || locale === "fr" || locale === "en";
}

const TITLE_KEYS = { nl: "titleNl", fr: "titleFr", en: "titleEn" } as const;
const DESCRIPTION_KEYS = {
  nl: "descriptionNl",
  fr: "descriptionFr",
  en: "descriptionEn",
} as const;

/**
 * The event title for a visitor's locale: that language when it has text, else
 * the original language (the same fallback as `organizationDescription`, and as
 * the backend's `resolve_text`), so a blank translation never hides the title.
 */
export function eventTitle(event: EventText, locale: string): string {
  return (
    (isLanguage(locale) ? event[TITLE_KEYS[locale]]?.trim() : null) ||
    event[TITLE_KEYS[event.titleLanguage]]?.trim() ||
    event.title
  );
}

/** The event description for a visitor's locale; see `eventTitle`. */
export function eventDescription(event: EventText, locale: string): string {
  return (
    (isLanguage(locale) ? event[DESCRIPTION_KEYS[locale]]?.trim() : null) ||
    (event.descriptionLanguage
      ? event[DESCRIPTION_KEYS[event.descriptionLanguage]]?.trim()
      : null) ||
    event.description
  );
}

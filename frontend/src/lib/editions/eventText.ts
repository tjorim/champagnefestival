import type { Product } from "@/api-types";
import type { EventLanguage, EventTranslations, ProductTranslations } from "@/types/event";

type EventText = Partial<EventTranslations> & { title: string; description: string };

function isLanguage(locale: string): locale is EventLanguage {
  return locale === "nl" || locale === "fr" || locale === "en";
}

const TITLE_KEYS = { nl: "title_nl", fr: "title_fr", en: "title_en" } as const;
const DESCRIPTION_KEYS = {
  nl: "description_nl",
  fr: "description_fr",
  en: "description_en",
} as const;

/**
 * The event title for a visitor's locale: that language when it has text, else
 * Dutch (the same fallback as `organizationDescription`, and as the backend's
 * `resolve_text`), so a blank translation never hides the title.
 */
export function eventTitle(event: EventText, locale: string): string {
  return (
    (isLanguage(locale) ? event[TITLE_KEYS[locale]]?.trim() : null) ||
    event.title_nl?.trim() ||
    event.title
  );
}

/** The event description for a visitor's locale; see `eventTitle`. */
export function eventDescription(event: EventText, locale: string): string {
  return (
    (isLanguage(locale) ? event[DESCRIPTION_KEYS[locale]]?.trim() : null) ||
    event.description_nl?.trim() ||
    event.description
  );
}

const NAME_KEYS = { nl: "name_nl", fr: "name_fr", en: "name_en" } as const;
const PRODUCT_DESCRIPTION_KEYS = {
  nl: "description_nl",
  fr: "description_fr",
  en: "description_en",
} as const;

type ProductText = Pick<Product, "name" | "description"> & ProductTranslations;

/** The product name for a visitor's locale; falls back to Dutch. */
export function productName(product: ProductText, locale: string): string {
  return (
    (isLanguage(locale) ? product[NAME_KEYS[locale]]?.trim() : null) ||
    product.name_nl?.trim() ||
    product.name
  );
}

/** The product description for a visitor's locale; see `productName`. */
export function productDescription(product: ProductText, locale: string): string {
  return (
    (isLanguage(locale) ? product[PRODUCT_DESCRIPTION_KEYS[locale]]?.trim() : null) ||
    product.description_nl?.trim() ||
    product.description
  );
}

import type { SliderItem } from "@/config/editions";

export function exhibitorDescription(item: SliderItem, locale: string): string | null {
  const language = locale === "nl" || locale === "fr" || locale === "en" ? locale : null;
  return (
    (language ? item[`description_${language}`]?.trim() : null) ||
    (item.description_language ? item[`description_${item.description_language}`]?.trim() : null) ||
    null
  );
}

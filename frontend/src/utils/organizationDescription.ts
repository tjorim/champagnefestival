import type { SliderItem } from "@/config/editions";

export function organizationDescription(item: SliderItem, locale: string): string | null {
  const language = locale === "nl" || locale === "fr" || locale === "en" ? locale : null;
  return (
    (language ? item[`description_${language}`]?.trim() : null) ||
    item.description_nl?.trim() ||
    null
  );
}

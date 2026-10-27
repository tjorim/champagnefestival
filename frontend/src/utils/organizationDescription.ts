import type { SliderItem } from "@/config/editions";
import { pickTranslation, type TranslatedText } from "./translatedText";

export function organizationDescription(item: SliderItem, locale: string): TranslatedText | null {
  return pickTranslation(
    { nl: item.description_nl, fr: item.description_fr, en: item.description_en },
    locale,
  );
}

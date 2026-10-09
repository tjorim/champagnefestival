import type { EventLanguage } from "@/types/event";

/** An admin-managed event category; `Event.category` holds its `key`. */
export interface EventCategory {
  key: string;
  /** Label in the original language (the list is fetched without a locale). */
  label: string;
  labelLanguage: EventLanguage;
  labelNl: string | null;
  labelFr: string | null;
  labelEn: string | null;
  sortOrder: number;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function apiToEventCategory(data: Record<string, unknown>): EventCategory {
  return {
    key: String(data.key ?? ""),
    label: String(data.label ?? ""),
    labelLanguage:
      data.label_language === "fr" || data.label_language === "en" ? data.label_language : "nl",
    labelNl: nullableText(data.label_nl),
    labelFr: nullableText(data.label_fr),
    labelEn: nullableText(data.label_en),
    sortOrder: typeof data.sort_order === "number" ? data.sort_order : 0,
  };
}

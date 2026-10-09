import { queryOptions, useQuery } from "@tanstack/react-query";
import { getLocale } from "@/paraglide/runtime";
import { apiToEventCategory, type EventCategory } from "@/types/eventCategory";
import { queryKeys } from "@/utils/queryKeys";

export async function fetchEventCategories(): Promise<EventCategory[]> {
  const response = await fetch("/api/event-categories");
  if (!response.ok) throw new Error(`Failed to load event categories: ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToEventCategory) : [];
}

export const eventCategoriesQueryOptions = queryOptions({
  queryKey: queryKeys.eventCategories,
  queryFn: fetchEventCategories,
  staleTime: 5 * 60 * 1000,
  retry: false,
});

/**
 * The label of a category for a visitor's language: that language when it has
 * text, else the original language (as for event titles). `null` while the
 * categories are loading or when the key is unknown, so callers can omit the
 * label instead of showing a raw key.
 */
export function eventCategoryLabel(
  categories: readonly EventCategory[] | undefined,
  key: string,
  locale: string = getLocale(),
): string | null {
  const category = categories?.find((candidate) => candidate.key === key);
  if (!category) return null;
  const byLanguage = { nl: category.labelNl, fr: category.labelFr, en: category.labelEn };
  const localized =
    locale === "nl" || locale === "fr" || locale === "en" ? byLanguage[locale] : null;
  return localized?.trim() || byLanguage[category.labelLanguage]?.trim() || category.label || null;
}

export function useEventCategories() {
  return useQuery(eventCategoriesQueryOptions);
}

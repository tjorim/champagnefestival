import { queryOptions, useQuery } from "@tanstack/react-query";
import { getLocale } from "@/paraglide/runtime";
import { apiToCategory, type Category } from "@/types/category";
import { queryKeys } from "@/utils/queryKeys";

async function fetchCategories(path: string): Promise<Category[]> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load categories from ${path}: ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToCategory) : [];
}

function categoriesQueryOptions(queryKey: readonly string[], path: string) {
  return queryOptions({
    queryKey,
    queryFn: () => fetchCategories(path),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export const eventCategoriesQueryOptions = categoriesQueryOptions(
  queryKeys.eventCategories,
  "/api/event-categories",
);

export const productCategoriesQueryOptions = categoriesQueryOptions(
  queryKeys.productCategories,
  "/api/product-categories",
);

/**
 * The label of a category for a visitor's language: that language when it has
 * text, else the original language (as for event titles). `null` while the
 * categories are loading or when the key is unknown, so callers can omit the
 * label instead of showing a raw key.
 */
export function categoryLabel(
  categories: readonly Category[] | undefined,
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

export function useProductCategories() {
  return useQuery(productCategoriesQueryOptions);
}

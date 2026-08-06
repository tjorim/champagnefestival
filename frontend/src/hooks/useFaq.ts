/**
 * useFaq — active FAQ items for the public FAQ section, sourced from the
 * admin-editable /api/faq/active endpoint rather than hardcoded per-locale
 * translation strings. Each item is resolved server-side to the current
 * locale; an item with no translation for this locale is simply absent from
 * the response, not filled in from another language.
 */

import { useQuery } from "@tanstack/react-query";
import { getLocale } from "@/paraglide/runtime";
import { queryKeys } from "@/utils/queryKeys";

export interface PublicFaqItem {
  id: string;
  question: string;
  answer: string;
}

export async function fetchFaqItems(locale: string): Promise<PublicFaqItem[]> {
  const res = await fetch(`/api/faq/active?locale=${encodeURIComponent(locale)}`);
  if (!res.ok) {
    throw new Error(`Failed to load FAQ: ${res.status}`);
  }
  return (await res.json()) as PublicFaqItem[];
}

export interface FaqState {
  items: PublicFaqItem[];
  /** True once the fetch has settled (success or failure). */
  isLoaded: boolean;
  /** True when the fetch itself failed — false while loading or once genuinely empty. */
  hasLoadError: boolean;
}

export function useFaq(): FaqState {
  const locale = getLocale();
  const query = useQuery({
    queryKey: queryKeys.faq(locale),
    queryFn: () => fetchFaqItems(locale),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    items: query.data ?? [],
    isLoaded: query.status !== "pending",
    hasLoadError: query.isError,
  };
}

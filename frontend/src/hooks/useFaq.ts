/**
 * useFaq — active FAQ items for the public FAQ section, sourced from the
 * admin-editable /api/faq/active endpoint rather than hardcoded per-locale
 * translation strings.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/utils/queryKeys";

export interface PublicFaqItem {
  id: string;
  question: string;
  answer: string;
}

interface ApiFaqItem {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  active: boolean;
}

export async function fetchFaqItems(): Promise<PublicFaqItem[]> {
  const res = await fetch("/api/faq/active");
  if (!res.ok) {
    throw new Error(`Failed to load FAQ: ${res.status}`);
  }
  const api = (await res.json()) as ApiFaqItem[];
  return api.map(({ id, question, answer }) => ({ id, question, answer }));
}

export function useFaq(): { items: PublicFaqItem[]; isLoaded: boolean } {
  const query = useQuery({
    queryKey: queryKeys.faq,
    queryFn: fetchFaqItems,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    items: query.data ?? [],
    isLoaded: query.status !== "pending",
  };
}

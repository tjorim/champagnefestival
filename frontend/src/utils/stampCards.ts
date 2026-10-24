import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";

export interface StampProgress {
  card_id: string;
  stamps: number;
  box_count: number;
  reward_earned: boolean;
}
export interface StampCardTypeWrite {
  name_nl: string;
  name_fr: string | null;
  name_en: string | null;
  reward_label_nl: string;
  reward_label_fr: string | null;
  reward_label_en: string | null;
  box_count: number;
  active: boolean;
}
export interface StampCardType extends StampCardTypeWrite {
  id: string;
}
export interface StampReward {
  id: string;
  reward_label_nl: string;
  reward_label_fr: string | null;
  reward_label_en: string | null;
  earned_at: string;
  handed_out_at: string | null;
}
export interface StampCard extends Omit<StampReward, "earned_at" | "handed_out_at"> {
  person_id: string;
  box_count: number;
  opened_at: string;
  completed_at: string | null;
  stamps: { id: string; created_at: string }[];
  reward: StampReward | null;
}
export function stampLabel(value: {
  reward_label_nl: string;
  reward_label_fr: string | null;
  reward_label_en: string | null;
}) {
  const locale = getLocale();
  return (
    (locale === "fr" ? value.reward_label_fr : locale === "en" ? value.reward_label_en : null) ||
    value.reward_label_nl
  );
}
export function stampTypeName(value: StampCardType) {
  const locale = getLocale();
  return (
    (locale === "fr" ? value.name_fr : locale === "en" ? value.name_en : null) || value.name_nl
  );
}
export const stampKeys = {
  types: ["admin", "stamp-cards", "types"] as const,
  cards: (id: string) => ["admin", "people", id, "stamp-cards"] as const,
};
export function stampRequest<T>(
  path: string,
  authHeaders: () => Record<string, string>,
  signal?: AbortSignal,
  body?: unknown,
  method = "GET",
) {
  return fetchJsonOrThrowWithUnauthorized<T>(
    path,
    {
      method,
      signal,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    m.stamp_error(),
  );
}

import type {
  StampProgress as ApiStampProgress,
  StampCardTypeWrite as ApiStampCardTypeWrite,
  StampCardTypeOut,
  StampRewardOut,
  StampCardOut,
} from "@/api-types";
import { fetchJsonOrThrow } from "../api/adminApi";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import { pickTranslation } from "./translatedText";

export type StampProgress = ApiStampProgress;
export type StampCardTypeWrite = ApiStampCardTypeWrite;
export type StampCardType = StampCardTypeOut;
export type StampReward = StampRewardOut;
export type StampCard = StampCardOut;
export function stampLabelText(value: {
  reward_label_nl: string;
  reward_label_fr: string | null;
  reward_label_en: string | null;
}) {
  return (
    pickTranslation(
      { nl: value.reward_label_nl, fr: value.reward_label_fr, en: value.reward_label_en },
      getLocale(),
    ) ?? { text: value.reward_label_nl, lang: undefined }
  );
}
export function stampLabel(value: Parameters<typeof stampLabelText>[0]) {
  return stampLabelText(value).text;
}
export function stampTypeNameText(value: StampCardType) {
  return (
    pickTranslation({ nl: value.name_nl, fr: value.name_fr, en: value.name_en }, getLocale()) ?? {
      text: value.name_nl,
      lang: undefined,
    }
  );
}
export function stampTypeName(value: StampCardType) {
  return stampTypeNameText(value).text;
}
export const stampKeys = {
  types: ["admin", "stamp-cards", "types"] as const,
  cards: (id: string) => ["admin", "people", id, "stamp-cards"] as const,
};
export function stampRequest<T>(
  path: string,

  signal?: AbortSignal,
  body?: unknown,
  method = "GET",
) {
  return fetchJsonOrThrow<T>(
    path,
    {
      method,
      signal,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    m.stamp_error(),
  );
}

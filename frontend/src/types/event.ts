import type { EventOut, ProductOut, PushSubscribeRequest } from "@/api-types";
export type EventLanguage = PushSubscribeRequest["locale"];
export type EventTranslations = Pick<
  EventOut,
  "title_nl" | "title_fr" | "title_en" | "description_nl" | "description_fr" | "description_en"
>;
export type ProductTranslations = Pick<
  ProductOut,
  "name_nl" | "name_fr" | "name_en" | "description_nl" | "description_fr" | "description_en"
>;
export const NO_PRODUCT_TRANSLATIONS: ProductTranslations = {
  name_nl: null,
  name_fr: null,
  name_en: null,
  description_nl: null,
  description_fr: null,
  description_en: null,
};

/** Form controls use empty strings for nullable text and local datetime inputs. */
type EventTextInput =
  | "title_nl"
  | "title_fr"
  | "title_en"
  | "description_nl"
  | "description_fr"
  | "description_en"
  | "end_time"
  | "registrations_open_from"
  | "registrations_close_at";
export type EventFormData = Omit<import("@/api-types").EventCreate, EventTextInput> & {
  [K in EventTextInput]: string;
};

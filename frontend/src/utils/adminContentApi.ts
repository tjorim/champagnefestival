import { apiToEdition, type Edition } from "@/components/admin/editionTypes";
import type { ItemDraft } from "@/components/admin/itemTypes";
import type { Language, LocalizedText } from "@/components/admin/LocalizedFields";
import type { SponsorTier } from "@/config/editions";
import { m } from "@/paraglide/messages";
import { apiErrorFromResponse } from "@/utils/apiErrors";
import type { DietaryTag } from "@/utils/dietaryTags";
import { parsePollKind, type PollQuestionKind } from "@/utils/pollKinds";
import {
  apiToEvent,
  apiToProduct,
  type Event,
  type EventFormData,
  type Product,
} from "@/types/event";

function datetimeLocalToIso(value: string): string {
  return new Date(value).toISOString();
}

/**
 * Safe fetch wrapper that handles network errors and non-ok responses
 * with user-friendly error messages.
 */
async function safeFetch(
  url: string,
  options?: RequestInit,
  operation?: string,
): Promise<Response> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw await apiErrorFromResponse(response, operation ?? m.admin_api_request_failed());
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(operation ?? "Network error occurred");
  }
}

function apiToItemDraft(d: Record<string, unknown>): ItemDraft {
  const cp = (d.contact_person ?? null) as {
    id: string;
    name: string;
    email: string;
    phone: string;
  } | null;
  return {
    id: d.id as number,
    name: d.name as string,
    image: d.image as string,
    website: d.website as string | undefined,
    description_nl: (d.description_nl as ItemDraft["description_nl"]) ?? null,
    description_fr: (d.description_fr as ItemDraft["description_fr"]) ?? null,
    description_en: (d.description_en as ItemDraft["description_en"]) ?? null,

    active: d.active as boolean | undefined,
    type: d.type as string | undefined,
    contactPersonId: (d.contact_person_id as string | null) ?? null,
    contactPerson: cp,
  };
}

export async function fetchContentSectionItems(
  sectionKey: string,
  authHeaders: () => Record<string, string>,
): Promise<ItemDraft[]> {
  const response = await safeFetch(
    `/api/${sectionKey}`,
    { headers: authHeaders() },
    m.admin_api_load_section({ section: sectionKey }),
  );
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToItemDraft) : [];
}

export async function saveContentSectionItem(
  sectionKey: string,
  draft: ItemDraft,
  authHeaders: () => Record<string, string>,
): Promise<ItemDraft> {
  const isNew = draft.id <= 0;
  const payload = {
    name: draft.name,
    image: draft.image,
    website: draft.website ?? "",
    description_nl: draft.description_nl || null,
    description_fr: draft.description_fr || null,
    description_en: draft.description_en || null,

    type: draft.type ?? "vendor",
    contact_person_id: draft.contactPersonId ?? null,
  };

  const response = isNew
    ? await safeFetch(
        `/api/${sectionKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        },
        m.admin_api_save_section({ section: sectionKey }),
      )
    : await safeFetch(
        `/api/${sectionKey}/${draft.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        },
        m.admin_api_update_section({ section: sectionKey }),
      );

  return apiToItemDraft((await response.json()) as Record<string, unknown>);
}

export async function updateContentSectionItemActive(
  sectionKey: string,
  id: number,
  active: boolean,
  authHeaders: () => Record<string, string>,
): Promise<ItemDraft> {
  const response = await safeFetch(
    `/api/${sectionKey}/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ active }),
    },
    m.admin_api_update_section_status({ section: sectionKey }),
  );

  return apiToItemDraft((await response.json()) as Record<string, unknown>);
}

export async function deleteContentSectionItem(
  sectionKey: string,
  id: number,
  authHeaders: () => Record<string, string>,
): Promise<number> {
  await safeFetch(
    `/api/${sectionKey}/${id}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_api_delete_section({ section: sectionKey }),
  );
  return id;
}

export async function fetchEditions(authHeaders: () => Record<string, string>): Promise<Edition[]> {
  const response = await safeFetch(
    "/api/editions?include_inactive=true",
    { headers: authHeaders() },
    m.admin_api_load_editions(),
  );

  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToEdition) : [];
}

interface ApiOrganization {
  id: number;
  name: string;
  active?: boolean;
  type?: string;
}

export async function fetchEditionModalOrganizations(
  authHeaders: () => Record<string, string>,
): Promise<ItemDraft[]> {
  const response = await safeFetch(
    "/api/organizations",
    { headers: authHeaders() },
    m.admin_api_load_organizations(),
  );

  const data = (await response.json()) as ApiOrganization[];
  return Array.isArray(data)
    ? data.map((item) => ({
        id: item.id,
        name: item.name,
        image: "",
        active: item.active ?? true,
        type: item.type,
      }))
    : [];
}

export async function saveEdition(
  payload: {
    id: string;
    year: number;
    month: string;
    editionType: Edition["editionType"];
    venueId: string;
    active: boolean;
    /** The lineup, in display order. */
    organizationIds: number[];
    /** Level per lineup sponsor (organization id); sponsors without an entry are untiered. */
    sponsorTiers?: Record<number, SponsorTier>;
    /**
     * Omit to leave an existing co-organizer untouched; pass `null` to clear it.
     * The backend only acts on the field when it is present in the payload.
     */
    coOrganizerOrganizationId?: number | null;
  },
  authHeaders: () => Record<string, string>,
  initialId?: string,
): Promise<Edition> {
  const isEdit = Boolean(initialId);
  const response = await safeFetch(
    isEdit ? `/api/editions/${initialId}` : "/api/editions",
    {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        ...(isEdit ? {} : { id: payload.id }),
        year: payload.year,
        month: payload.month,
        venue_id: payload.venueId,
        edition_type: payload.editionType,
        active: payload.active,
        // Always send `organizations` explicitly (even `[]` for off-festival editions) so the
        // backend receives an intentional instruction rather than treating the omitted
        // field as "leave existing associations alone".
        organizations: payload.editionType === "festival" ? payload.organizationIds : [],
        sponsor_tiers: payload.editionType === "festival" ? (payload.sponsorTiers ?? {}) : {},
        // Independent of the lineup: any edition type may name a co-organizer.
        ...(payload.coOrganizerOrganizationId === undefined
          ? {}
          : { co_organizer_organization_id: payload.coOrganizerOrganizationId }),
      }),
    },
    isEdit ? m.admin_api_update_edition() : m.admin_api_create_edition(),
  );

  return apiToEdition((await response.json()) as Record<string, unknown>);
}

export async function fetchEditionEvents(
  editionId: string,
  authHeaders: () => Record<string, string>,
): Promise<Event[]> {
  const response = await safeFetch(
    `/api/events?edition_id=${encodeURIComponent(editionId)}`,
    { headers: authHeaders() },
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToEvent) : [];
}

/**
 * `<field>_nl/_fr/_en` request fields for a per-language text; a blank
 * translation is sent as `null`, which clears it on update.
 */
function localizedBody<Field extends string>(field: Field, text: LocalizedText) {
  const value = (language: Language) => text[language].trim() || null;
  return {
    [`${field}_nl`]: value("nl"),
    [`${field}_fr`]: value("fr"),
    [`${field}_en`]: value("en"),
  } as Record<`${Field}_${Language}`, string | null>;
}

export function eventTextBody(formData: EventFormData) {
  const text = (value: string) => value.trim() || null;
  return {
    title_nl: text(formData.titleNl),
    title_fr: text(formData.titleFr),
    title_en: text(formData.titleEn),
    description_nl: text(formData.descriptionNl),
    description_fr: text(formData.descriptionFr),
    description_en: text(formData.descriptionEn),
  };
}

export async function saveEditionEvent(
  payload: {
    editionId: string;
    editingEventId?: string;
    formData: EventFormData;
  },
  authHeaders: () => Record<string, string>,
): Promise<Event> {
  const response = await safeFetch(
    payload.editingEventId ? `/api/events/${payload.editingEventId}` : "/api/events",
    {
      method: payload.editingEventId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        edition_id: payload.editionId,
        ...eventTextBody(payload.formData),
        date: payload.formData.date,
        start_time: payload.formData.startTime,
        end_time: payload.formData.endTime || null,
        category: payload.formData.category,
        volunteers_only: payload.formData.volunteersOnly ?? false,
        members_only: payload.formData.membersOnly ?? false,
        registration_required: payload.formData.registrationRequired,
        registrations_open_from:
          payload.formData.registrationRequired && payload.formData.registrationsOpenFrom
            ? datetimeLocalToIso(payload.formData.registrationsOpenFrom)
            : null,
        registrations_close_at:
          payload.formData.registrationRequired && payload.formData.registrationsCloseAt
            ? datetimeLocalToIso(payload.formData.registrationsCloseAt)
            : null,
        active: payload.formData.active,
      }),
    },
    m.admin_content_error_save(),
  );

  return apiToEvent((await response.json()) as Record<string, unknown>);
}

export async function deleteEditionEvent(
  eventId: string,
  authHeaders: () => Record<string, string>,
): Promise<void> {
  await safeFetch(
    `/api/events/${eventId}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_content_error_save(),
  );
}

export async function fetchEventProducts(
  eventId: string,
  authHeaders: () => Record<string, string>,
): Promise<Product[]> {
  const response = await safeFetch(
    `/api/products?event_id=${encodeURIComponent(eventId)}`,
    { headers: authHeaders() },
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToProduct) : [];
}

export interface ProductWrite {
  id?: string;
  eventId: string;
  /** Per-language product name; a blank translation is cleared. */
  name: LocalizedText;
  description: LocalizedText;
  price: number;
  category: string;
  purchasable: boolean;
  required: boolean;
  includedProductId?: string;
  includedPerGuests?: number;
  unit?: "item" | "table" | "person";
  stock?: number | null;
  inclusions?: import("@/types/event").ProductInclusion[] | null;
  updateExistingContents?: boolean;
  updateExistingPrices?: boolean;
  confirmShortage?: boolean;
  previewToken?: string;
}
export interface ProductChangePreview {
  preview_token: string;
  price_changed: boolean;
  contents_changed: boolean;
  bookings: {
    id: string;
    before_total: string;
    after_total: string;
    amount_paid: string;
    refund_due: string;
    before_items: { name: string; quantity: number }[];
    after_items: { name: string; quantity: number }[];
  }[];
  shortages: { name: string; stock: number; reserved: number; shortage: number }[];
}
function productWriteBody(payload: ProductWrite) {
  return {
    ...(!payload.id ? { event_id: payload.eventId } : {}),
    ...localizedBody("name", payload.name),
    ...localizedBody("description", payload.description),
    price: payload.price,
    category: payload.category,
    purchasable: payload.purchasable,
    required: payload.required,
    included_product_id: payload.includedProductId ?? null,
    included_per_guests: payload.includedPerGuests ?? null,
    ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
    ...(payload.stock !== undefined ? { stock: payload.stock } : {}),
    ...(payload.inclusions !== undefined ? { inclusions: payload.inclusions } : {}),
    ...(payload.id
      ? {
          update_existing_contents: payload.updateExistingContents ?? false,
          update_existing_prices: payload.updateExistingPrices ?? false,
          confirm_shortage: payload.confirmShortage ?? false,
          preview_token: payload.previewToken,
        }
      : {}),
  };
}
export async function previewEventProduct(
  payload: ProductWrite,
  authHeaders: () => Record<string, string>,
): Promise<ProductChangePreview> {
  const response = await safeFetch(
    `/api/products/${payload.id}/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(productWriteBody(payload)),
    },
    m.admin_content_error_save(),
  );
  return response.json();
}
export async function saveEventProduct(
  payload: ProductWrite,
  authHeaders: () => Record<string, string>,
): Promise<Product> {
  const response = await safeFetch(
    payload.id ? `/api/products/${payload.id}` : "/api/products",
    {
      method: payload.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(productWriteBody(payload)),
    },
    m.admin_content_error_save(),
  );
  return apiToProduct((await response.json()) as Record<string, unknown>);
}

export async function deleteEventProduct(
  productId: string,
  authHeaders: () => Record<string, string>,
): Promise<void> {
  await safeFetch(
    `/api/products/${productId}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_content_error_save(),
  );
}

export async function deleteEditionById(
  editionId: string,
  authHeaders: () => Record<string, string>,
): Promise<string> {
  await safeFetch(
    `/api/editions/${editionId}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_content_error_save(),
  );
  return editionId;
}

export type EditionArtworkSlot = "flyer" | "hero" | "share";

/**
 * Publish a flyer, hero photo or sharing image for an edition (#1224). Multipart,
 * so the browser sets the boundary header; live immediately. Not retried: after an
 * ambiguous failure, reload the edition before uploading again.
 */
export async function uploadEditionArtwork(
  editionId: string,
  slot: EditionArtworkSlot,
  file: File,
  authHeaders: () => Record<string, string>,
): Promise<Edition> {
  const body = new FormData();
  body.append("file", file);
  const response = await safeFetch(
    `/api/editions/${encodeURIComponent(editionId)}/artwork/${slot}`,
    { method: "POST", headers: authHeaders(), body },
    m.admin_edition_artwork_error(),
  );
  return apiToEdition((await response.json()) as Record<string, unknown>);
}

/** Empty an artwork slot so the site falls back to its static image. Clearing an empty slot is harmless. */
export async function clearEditionArtwork(
  editionId: string,
  slot: EditionArtworkSlot,
  authHeaders: () => Record<string, string>,
): Promise<Edition> {
  const response = await safeFetch(
    `/api/editions/${encodeURIComponent(editionId)}/artwork/${slot}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_edition_artwork_error(),
  );
  return apiToEdition((await response.json()) as Record<string, unknown>);
}

export const DIETARY_TAGS: readonly DietaryTag[] = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "lactose_free",
  "contains_nuts",
];

function dietaryTags(value: unknown): DietaryTag[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is DietaryTag => DIETARY_TAGS.includes(tag as DietaryTag))
    : [];
}

function nullableLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export type { PollQuestionKind };

export interface PollOption {
  id: string;
  questionId: string;
  /** The Dutch label (what the admin lists show); volunteers get their own language. */
  label: string;
  labelNl: string;
  labelFr: string | null;
  labelEn: string | null;
  dietaryTags: DietaryTag[];
  sortOrder: number;
  /** Sum of every volunteer's quantity: what to order from the caterer. */
  totalQuantity: number;
  /** How many volunteers picked it. */
  volunteerCount: number;
}

/** The editable text of an option; a blank French or English label is cleared. */
export interface PollOptionWrite {
  labelNl: string;
  labelFr: string;
  labelEn: string;
  dietaryTags: DietaryTag[];
}

export interface PollQuestion {
  eventId?: string | null;
  id: string;
  editionId: string;
  kind: PollQuestionKind;
  /** The Dutch title; volunteers get their own language. */
  title: string;
  titleNl: string;
  titleFr: string | null;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionFr: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  /** ISO timestamp after which volunteers can no longer change their answer, or null while open. */
  closesAt: string | null;
  closed: boolean;
  /** The options of a meals question, in display order. */
  options: PollOption[];
  /** Volunteers who answered. */
  answeredCount: number;
  yesCount: number;
  noCount: number;
  /** The number of people the yes answers stand for. */
  peopleTotal: number;
}

/** The editable texts of a question; a blank French or English text is cleared. */
export interface PollQuestionWrite {
  eventId?: string | null;
  titleNl: string;
  titleFr: string;
  titleEn: string;
  descriptionNl: string;
  descriptionFr: string;
  descriptionEn: string;
}

function apiToPollOption(data: Record<string, unknown>): PollOption {
  return {
    id: String(data.id ?? ""),
    questionId: String(data.question_id ?? ""),
    label: String(data.label ?? ""),
    labelNl: String(data.label_nl ?? data.label ?? ""),
    labelFr: nullableLabel(data.label_fr),
    labelEn: nullableLabel(data.label_en),
    dietaryTags: dietaryTags(data.dietary_tags),
    sortOrder: Number(data.sort_order ?? 0),
    totalQuantity: Number(data.total_quantity ?? 0),
    volunteerCount: Number(data.volunteer_count ?? 0),
  };
}

function apiToPollQuestion(data: Record<string, unknown>): PollQuestion {
  const options = Array.isArray(data.options) ? (data.options as Record<string, unknown>[]) : [];
  return {
    id: String(data.id ?? ""),
    editionId: String(data.edition_id ?? ""),
    eventId: typeof data.event_id === "string" ? data.event_id : null,
    kind: parsePollKind(data.kind),
    title: String(data.title ?? ""),
    titleNl: String(data.title_nl ?? data.title ?? ""),
    titleFr: nullableLabel(data.title_fr),
    titleEn: nullableLabel(data.title_en),
    descriptionNl: nullableLabel(data.description_nl),
    descriptionFr: nullableLabel(data.description_fr),
    descriptionEn: nullableLabel(data.description_en),
    sortOrder: Number(data.sort_order ?? 0),
    closesAt: typeof data.closes_at === "string" ? data.closes_at : null,
    closed: Boolean(data.closed),
    options: options.map(apiToPollOption),
    answeredCount: Number(data.answered_count ?? 0),
    yesCount: Number(data.yes_count ?? 0),
    noCount: Number(data.no_count ?? 0),
    peopleTotal: Number(data.people_total ?? 0),
  };
}

function pollOptionBody(write: PollOptionWrite) {
  return {
    label_nl: write.labelNl.trim(),
    label_fr: write.labelFr.trim() || null,
    label_en: write.labelEn.trim() || null,
    dietary_tags: write.dietaryTags,
  };
}

function pollQuestionBody(write: PollQuestionWrite) {
  return {
    ...(write.eventId === undefined ? {} : { event_id: write.eventId || null }),
    title_nl: write.titleNl.trim(),
    title_fr: write.titleFr.trim() || null,
    title_en: write.titleEn.trim() || null,
    description_nl: write.descriptionNl.trim() || null,
    description_fr: write.descriptionFr.trim() || null,
    description_en: write.descriptionEn.trim() || null,
  };
}

function jsonRequest(method: string, body: unknown, authHeaders: () => Record<string, string>) {
  return {
    method,
    headers: { ...JSON_HEADERS, ...authHeaders() },
    body: JSON.stringify(body),
  };
}

export async function fetchPollQuestions(
  editionId: string,
  authHeaders: () => Record<string, string>,
): Promise<PollQuestion[]> {
  const response = await safeFetch(
    `/api/poll-questions?edition_id=${encodeURIComponent(editionId)}`,
    { headers: authHeaders() },
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToPollQuestion) : [];
}

export async function createPollQuestion(
  payload: { editionId: string; kind: PollQuestionKind } & PollQuestionWrite,
  authHeaders: () => Record<string, string>,
): Promise<PollQuestion> {
  const response = await safeFetch(
    "/api/poll-questions",
    jsonRequest(
      "POST",
      { edition_id: payload.editionId, kind: payload.kind, ...pollQuestionBody(payload) },
      authHeaders,
    ),
    m.admin_content_error_save(),
  );
  return apiToPollQuestion((await response.json()) as Record<string, unknown>);
}

export async function updatePollQuestion(
  questionId: string,
  write: PollQuestionWrite,
  authHeaders: () => Record<string, string>,
): Promise<PollQuestion> {
  const response = await safeFetch(
    `/api/poll-questions/${questionId}`,
    jsonRequest("PUT", pollQuestionBody(write), authHeaders),
    m.admin_content_error_save(),
  );
  return apiToPollQuestion((await response.json()) as Record<string, unknown>);
}

/** Set when a question closes (a past time closes it now); `null` reopens it. */
export async function setPollQuestionClosing(
  questionId: string,
  closesAt: string | null,
  authHeaders: () => Record<string, string>,
): Promise<PollQuestion> {
  const response = await safeFetch(
    `/api/poll-questions/${questionId}`,
    jsonRequest("PUT", { closes_at: closesAt }, authHeaders),
    m.admin_content_error_save(),
  );
  return apiToPollQuestion((await response.json()) as Record<string, unknown>);
}

/** Delete a question; `confirmAnswers` is required when volunteers already answered it. */
export async function deletePollQuestion(
  questionId: string,
  authHeaders: () => Record<string, string>,
  confirmAnswers = false,
  notify = true,
): Promise<void> {
  await safeFetch(
    `/api/poll-questions/${questionId}?notify=${notify}${confirmAnswers ? "&confirm_answers=true" : ""}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_content_error_save(),
  );
}

export async function reorderPollQuestions(
  editionId: string,
  orderedIds: string[],
  authHeaders: () => Record<string, string>,
): Promise<PollQuestion[]> {
  const response = await safeFetch(
    "/api/poll-questions/reorder",
    jsonRequest("POST", { edition_id: editionId, ordered_ids: orderedIds }, authHeaders),
    m.admin_content_error_save(),
  );
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToPollQuestion) : [];
}

/** Copy the questions (with their options) of another edition; returns the questions created. */
export async function copyPollQuestions(
  fromEditionId: string,
  toEditionId: string,
  authHeaders: () => Record<string, string>,
): Promise<PollQuestion[]> {
  const response = await safeFetch(
    "/api/poll-questions/copy",
    jsonRequest(
      "POST",
      { from_edition_id: fromEditionId, to_edition_id: toEditionId },
      authHeaders,
    ),
    m.admin_content_error_save(),
  );
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToPollQuestion) : [];
}

export async function createPollOption(
  payload: { questionId: string } & PollOptionWrite,
  authHeaders: () => Record<string, string>,
): Promise<PollOption> {
  const response = await safeFetch(
    "/api/poll-options",
    jsonRequest(
      "POST",
      { question_id: payload.questionId, ...pollOptionBody(payload) },
      authHeaders,
    ),
    m.admin_content_error_save(),
  );
  return apiToPollOption((await response.json()) as Record<string, unknown>);
}

export async function updatePollOption(
  optionId: string,
  write: PollOptionWrite,
  authHeaders: () => Record<string, string>,
): Promise<PollOption> {
  const response = await safeFetch(
    `/api/poll-options/${optionId}`,
    jsonRequest("PUT", pollOptionBody(write), authHeaders),
    m.admin_content_error_save(),
  );
  return apiToPollOption((await response.json()) as Record<string, unknown>);
}

/** Delete an option; `confirmSelections` is required when volunteers already picked it. */
export async function deletePollOption(
  optionId: string,
  authHeaders: () => Record<string, string>,
  confirmSelections = false,
  notify = true,
): Promise<void> {
  await safeFetch(
    `/api/poll-options/${optionId}?notify=${notify}${confirmSelections ? "&confirm_selections=true" : ""}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_content_error_save(),
  );
}

export async function reorderPollOptions(
  questionId: string,
  orderedIds: string[],
  authHeaders: () => Record<string, string>,
): Promise<PollOption[]> {
  const response = await safeFetch(
    "/api/poll-options/reorder",
    jsonRequest("POST", { question_id: questionId, ordered_ids: orderedIds }, authHeaders),
    m.admin_content_error_save(),
  );
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToPollOption) : [];
}

/** A volunteer's answer to a yes/no question; `attending` null means not answered. */
export interface PollAttendance {
  attending: boolean | null;
  /** Everyone a yes stands for, the volunteer included. */
  people: number;
}

export interface PollOrders {
  questions: {
    id: string;
    kind: PollQuestionKind;
    title: string;
    closed: boolean;
    options: { id: string; label: string; dietaryTags: DietaryTag[] }[];
    answeredCount: number;
    yesCount: number;
    noCount: number;
    peopleTotal: number;
  }[];
  volunteers: {
    volunteerId: string;
    name: string;
    note: string | null;
    answeredQuestionIds: string[];
    /** Quantity per option id. */
    quantities: Record<string, number>;
    /** Yes/no answer per question id. */
    attendance: Record<string, PollAttendance>;
    choices: Record<string, string>;
    texts: Record<string, string>;
    ratings: Record<string, number>;
  }[];
  volunteerCount: number;
}

/**
 * Enter or correct one volunteer's answers (for example from an email): `quantities` replaces all their meal
 * picks for the edition, `attendance` their yes/no answers (a null answer leaves the question unanswered) and
 * `note` their dietary note (empty clears it). `confirmClosed` is required for a change to a closed question.
 */
export async function setVolunteerPollOrder(
  editionId: string,
  volunteerId: string,
  payload: {
    quantities: Record<string, number>;
    attendance: Record<string, PollAttendance>;
    choices: Record<string, string>;
    texts: Record<string, string>;
    ratings: Record<string, number>;
    note: string;
    confirmClosed: boolean;
  },
  authHeaders: () => Record<string, string>,
): Promise<void> {
  await safeFetch(
    `/api/poll-questions/orders/${encodeURIComponent(volunteerId)}?edition_id=${encodeURIComponent(editionId)}`,
    jsonRequest(
      "PUT",
      {
        selections: Object.entries(payload.quantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([option_id, quantity]) => ({ option_id, quantity })),
        attendance: Object.entries(payload.attendance)
          .filter(([, answer]) => answer.attending !== null)
          .map(([question_id, answer]) => ({
            question_id,
            attending: answer.attending,
            people: answer.attending ? answer.people : 0,
          })),
        choices: Object.entries(payload.choices).map(([question_id, option_id]) => ({
          question_id,
          option_id,
        })),
        texts: Object.entries(payload.texts)
          .filter(([, text]) => text.trim())
          .map(([question_id, text]) => ({ question_id, text: text.trim() })),
        ratings: Object.entries(payload.ratings).map(([question_id, rating]) => ({
          question_id,
          rating,
        })),
        note: payload.note.trim(),
        confirm_closed: payload.confirmClosed,
      },
      authHeaders,
    ),
    m.admin_content_error_save(),
  );
}

export async function fetchPollOrders(
  editionId: string,
  locale: string,
  authHeaders: () => Record<string, string>,
): Promise<PollOrders> {
  const response = await safeFetch(
    `/api/poll-questions/orders?edition_id=${encodeURIComponent(editionId)}&locale=${encodeURIComponent(locale)}`,
    { headers: authHeaders() },
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Record<string, unknown>;
  const records = (value: unknown) =>
    Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  return {
    questions: records(data.questions).map((q) => ({
      id: String(q.id ?? ""),
      kind: parsePollKind(q.kind),
      title: String(q.title ?? ""),
      closed: Boolean(q.closed),
      options: records(q.options).map((o) => ({
        id: String(o.id ?? ""),
        label: String(o.label ?? ""),
        dietaryTags: dietaryTags(o.dietary_tags),
      })),
      answeredCount: Number(q.answered_count ?? 0),
      yesCount: Number(q.yes_count ?? 0),
      noCount: Number(q.no_count ?? 0),
      peopleTotal: Number(q.people_total ?? 0),
    })),
    volunteers: records(data.volunteers).map((v) => ({
      volunteerId: String(v.volunteer_id ?? ""),
      name: String(v.name ?? ""),
      note: nullableLabel(v.note),
      answeredQuestionIds: Array.isArray(v.answered_question_ids)
        ? v.answered_question_ids.map(String)
        : [],
      choices: Object.fromEntries(
        records(v.choices).map((item) => [String(item.question_id), String(item.option_id)]),
      ),
      texts: Object.fromEntries(
        records(v.texts).map((item) => [String(item.question_id), String(item.text)]),
      ),
      ratings: Object.fromEntries(
        records(v.ratings).map((item) => [String(item.question_id), Number(item.rating)]),
      ),
      quantities: Object.fromEntries(
        records(v.selections).map((selection) => [
          String(selection.option_id ?? ""),
          Number(selection.quantity ?? 0),
        ]),
      ),
      attendance: Object.fromEntries(
        records(v.attendance).map((item) => [
          String(item.question_id ?? ""),
          { attending: Boolean(item.attending), people: Number(item.people ?? 0) },
        ]),
      ),
    })),
    volunteerCount: Number(data.volunteer_count ?? 0),
  };
}

export async function fetchVolunteerPollEvents(
  authHeaders: () => Record<string, string>,
): Promise<Event[]> {
  const response = await safeFetch(
    "/api/events",
    { headers: authHeaders() },
    m.admin_content_error_load(),
  );
  const events = (await response.json()) as Record<string, unknown>[];
  return events.map(apiToEvent).filter((event) => event.volunteersOnly);
}

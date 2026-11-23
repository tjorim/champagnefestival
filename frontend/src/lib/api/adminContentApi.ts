import type { PollOptionUpdate, PollQuestionUpdate, OrganizationOut } from "@/api-types";
import type { PollOptionOut, PollQuestionOut } from "@/api-types";
import type { EventCreate, ProductCreate, ProductUpdate } from "@/api-types";
import type { Edition, EditionCreate } from "@/api-types";

import type { ItemDraft } from "@/types/itemTypes";
import type { Language, LocalizedText } from "@/components/admin/LocalizedFields";
import type { SponsorTier } from "@/config/editions";
import { m } from "@/paraglide/messages";
import { adminRequest } from "./adminApi";
import type { DietaryTag } from "../editions/dietaryTags";
import { type PollQuestionKind } from "../editions/pollKinds";
import type { Event, Product } from "@/api-types";
import { type EventFormData } from "@/types/event";

function datetimeLocalToIso(value: string): string {
  return new Date(value).toISOString();
}

export async function fetchContentSectionItems(sectionKey: string): Promise<OrganizationOut[]> {
  const response = await adminRequest(
    `/api/${sectionKey}`,
    {},
    m.admin_api_load_section({ section: sectionKey }),
  );
  const data: OrganizationOut[] = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function saveContentSectionItem(
  sectionKey: string,
  draft: ItemDraft,
): Promise<OrganizationOut> {
  const isNew = draft.id <= 0;
  const payload = {
    name: draft.name,
    image: draft.image,
    website: draft.website ?? "",
    description_nl: draft.description_nl || null,
    description_fr: draft.description_fr || null,
    description_en: draft.description_en || null,

    type: draft.type ?? "vendor",
    contact_person_id: draft.contact_person_id ?? null,
  };

  const response = isNew
    ? await adminRequest(
        `/api/${sectionKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        m.admin_api_save_section({ section: sectionKey }),
      )
    : await adminRequest(
        `/api/${sectionKey}/${draft.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        m.admin_api_update_section({ section: sectionKey }),
      );

  return response.json();
}

export async function updateContentSectionItemActive(
  sectionKey: string,
  id: number,
  active: boolean,
): Promise<OrganizationOut> {
  const response = await adminRequest(
    `/api/${sectionKey}/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    },
    m.admin_api_update_section_status({ section: sectionKey }),
  );

  return response.json();
}

export async function deleteContentSectionItem(sectionKey: string, id: number): Promise<number> {
  await adminRequest(
    `/api/${sectionKey}/${id}`,
    { method: "DELETE" },
    m.admin_api_delete_section({ section: sectionKey }),
  );
  return id;
}

export async function fetchEditions(): Promise<Edition[]> {
  const response = await adminRequest(
    "/api/editions?include_inactive=true",
    {},
    m.admin_api_load_editions(),
  );

  const data = (await response.json()) as Edition[];
  return Array.isArray(data) ? data : [];
}

export async function fetchEditionModalOrganizations(): Promise<OrganizationOut[]> {
  const response = await adminRequest("/api/organizations", {}, m.admin_api_load_organizations());

  const data: OrganizationOut[] = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function saveEdition(
  payload: {
    id: string;
    year: number;
    month: EditionCreate["month"];
    edition_type: Edition["edition_type"];
    venueId: string;
    active: boolean;
    /** The lineup, in display order. */
    organizations: number[];
    /** Level per lineup sponsor (organization id); sponsors without an entry are untiered. */
    sponsorTiers?: Record<number, SponsorTier>;
    /**
     * Omit to leave an existing co-organizer untouched; pass `null` to clear it.
     * The backend only acts on the field when it is present in the payload.
     */
    coOrganizerOrganizationId?: number | null;
  },

  initialId?: string,
): Promise<Edition> {
  const isEdit = Boolean(initialId);
  const response = await adminRequest(
    isEdit ? `/api/editions/${initialId}` : "/api/editions",
    {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isEdit ? {} : { id: payload.id }),
        year: payload.year,
        month: payload.month,
        venue_id: payload.venueId,
        edition_type: payload.edition_type,
        active: payload.active,
        // Always send `organizations` explicitly (even `[]` for off-festival editions) so the
        // backend receives an intentional instruction rather than treating the omitted
        // field as "leave existing associations alone".
        organizations: payload.edition_type === "festival" ? payload.organizations : [],
        sponsor_tiers: payload.edition_type === "festival" ? (payload.sponsorTiers ?? {}) : {},
        // Independent of the lineup: any edition type may name a co-organizer.
        ...(payload.coOrganizerOrganizationId === undefined
          ? {}
          : { co_organizer_organization_id: payload.coOrganizerOrganizationId }),
      }),
    },
    isEdit ? m.admin_api_update_edition() : m.admin_api_create_edition(),
  );

  return (await response.json()) as Edition;
}

export async function fetchEditionEvents(editionId: string): Promise<Event[]> {
  const response = await adminRequest(
    `/api/events?edition_id=${encodeURIComponent(editionId)}`,
    {},
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Event[];
  return Array.isArray(data) ? data : [];
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
    title_nl: text(formData.title_nl),
    title_fr: text(formData.title_fr),
    title_en: text(formData.title_en),
    description_nl: text(formData.description_nl),
    description_fr: text(formData.description_fr),
    description_en: text(formData.description_en),
  };
}

export async function saveEditionEvent(payload: {
  editionId: string;
  editingEventId?: string;
  formData: EventFormData;
}): Promise<Event> {
  const response = await adminRequest(
    payload.editingEventId ? `/api/events/${payload.editingEventId}` : "/api/events",
    {
      method: payload.editingEventId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        edition_id: payload.editionId,
        ...eventTextBody(payload.formData),
        date: payload.formData.date,
        start_time: payload.formData.start_time,
        end_time: payload.formData.end_time || null,
        category: payload.formData.category,
        volunteers_only: payload.formData.volunteers_only ?? false,
        members_only: payload.formData.members_only ?? false,
        registration_required: payload.formData.registration_required,
        registrations_open_from:
          payload.formData.registration_required && payload.formData.registrations_open_from
            ? datetimeLocalToIso(payload.formData.registrations_open_from)
            : null,
        registrations_close_at:
          payload.formData.registration_required && payload.formData.registrations_close_at
            ? datetimeLocalToIso(payload.formData.registrations_close_at)
            : null,
        active: payload.formData.active,
      } satisfies EventCreate),
    },
    m.admin_content_error_save(),
  );

  return (await response.json()) as Event;
}

export async function deleteEditionEvent(eventId: string): Promise<void> {
  await adminRequest(`/api/events/${eventId}`, { method: "DELETE" }, m.admin_content_error_save());
}

export async function fetchEventProducts(eventId: string): Promise<Product[]> {
  const response = await adminRequest(
    `/api/products?event_id=${encodeURIComponent(eventId)}`,
    {},
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Product[];
  return Array.isArray(data) ? data : [];
}

/** UI command: generated product fields plus grouped translation controls and propagation choices. */
export type ProductWrite = Pick<
  ProductCreate,
  | "price"
  | "category"
  | "purchasable"
  | "required"
  | "included_product_id"
  | "included_per_guests"
  | "unit"
  | "stock"
  | "inclusions"
> & {
  id?: string;
  eventId: ProductCreate["event_id"];
  name: LocalizedText;
  description: LocalizedText;
  updateExistingContents?: ProductUpdate["update_existing_contents"];
  updateExistingPrices?: ProductUpdate["update_existing_prices"];
  confirmShortage?: ProductUpdate["confirm_shortage"];
  previewToken?: ProductUpdate["preview_token"];
};
export type { ProductChangePreviewOut as ProductChangePreview } from "@/api-types";
import type { ProductChangePreviewOut as ProductChangePreview } from "@/api-types";
function productWriteBody(
  payload: ProductWrite,
): ProductUpdate & Partial<Pick<ProductCreate, "event_id">> {
  return {
    ...(!payload.id ? { event_id: payload.eventId } : {}),
    ...localizedBody("name", payload.name),
    ...localizedBody("description", payload.description),
    price: payload.price,
    category: payload.category,
    purchasable: payload.purchasable,
    required: payload.required,
    included_product_id: payload.included_product_id ?? null,
    included_per_guests: payload.included_per_guests ?? null,
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
export async function previewEventProduct(payload: ProductWrite): Promise<ProductChangePreview> {
  const response = await adminRequest(
    `/api/products/${payload.id}/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productWriteBody(payload)),
    },
    m.admin_content_error_save(),
  );
  return response.json();
}
export async function saveEventProduct(payload: ProductWrite): Promise<Product> {
  const response = await adminRequest(
    payload.id ? `/api/products/${payload.id}` : "/api/products",
    {
      method: payload.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productWriteBody(payload)),
    },
    m.admin_content_error_save(),
  );
  return (await response.json()) as Product;
}

export async function deleteEventProduct(productId: string): Promise<void> {
  await adminRequest(
    `/api/products/${productId}`,
    { method: "DELETE" },
    m.admin_content_error_save(),
  );
}

export async function deleteEditionById(editionId: string): Promise<string> {
  await adminRequest(
    `/api/editions/${editionId}`,
    { method: "DELETE" },
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
): Promise<Edition> {
  const body = new FormData();
  body.append("file", file);
  const response = await adminRequest(
    `/api/editions/${encodeURIComponent(editionId)}/artwork/${slot}`,
    { method: "POST", body },
    m.admin_edition_artwork_error(),
  );
  return (await response.json()) as Edition;
}

/** Empty an artwork slot so the site falls back to its static image. Clearing an empty slot is harmless. */
export async function clearEditionArtwork(
  editionId: string,
  slot: EditionArtworkSlot,
): Promise<Edition> {
  const response = await adminRequest(
    `/api/editions/${encodeURIComponent(editionId)}/artwork/${slot}`,
    { method: "DELETE" },
    m.admin_edition_artwork_error(),
  );
  return (await response.json()) as Edition;
}

export const DIETARY_TAGS: readonly DietaryTag[] = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "lactose_free",
  "contains_nuts",
];

const JSON_HEADERS = { "Content-Type": "application/json" };

export type { PollQuestionKind };

export type PollOption = PollOptionOut;

/** The editable text of an option; a blank French or English label is cleared. */
export interface PollOptionWrite {
  labelNl: string;
  labelFr: string;
  labelEn: string;
  dietaryTags: DietaryTag[];
}

export type PollQuestion = PollQuestionOut;

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

function pollOptionBody(write: PollOptionWrite): PollOptionUpdate {
  return {
    label_nl: write.labelNl.trim(),
    label_fr: write.labelFr.trim() || null,
    label_en: write.labelEn.trim() || null,
    dietary_tags: write.dietaryTags,
  };
}

function pollQuestionBody(write: PollQuestionWrite): PollQuestionUpdate {
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

function jsonRequest(method: string, body: unknown) {
  return {
    method,
    headers: { ...JSON_HEADERS },
    body: JSON.stringify(body),
  };
}

export async function fetchPollQuestions(editionId: string): Promise<PollQuestion[]> {
  const response = await adminRequest(
    `/api/poll-questions?edition_id=${encodeURIComponent(editionId)}`,
    {},
    m.admin_content_error_load(),
  );
  const data: PollQuestion[] = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createPollQuestion(
  payload: { editionId: string; kind: PollQuestionKind } & PollQuestionWrite,
): Promise<PollQuestion> {
  const response = await adminRequest(
    "/api/poll-questions",
    jsonRequest("POST", {
      edition_id: payload.editionId,
      kind: payload.kind,
      ...pollQuestionBody(payload),
    }),
    m.admin_content_error_save(),
  );
  return response.json();
}

export async function updatePollQuestion(
  questionId: string,
  write: PollQuestionWrite,
): Promise<PollQuestion> {
  const response = await adminRequest(
    `/api/poll-questions/${questionId}`,
    jsonRequest("PUT", pollQuestionBody(write)),
    m.admin_content_error_save(),
  );
  return response.json();
}

/** Set when a question closes (a past time closes it now); `null` reopens it. */
export async function setPollQuestionClosing(
  questionId: string,
  closesAt: string | null,
): Promise<PollQuestion> {
  const response = await adminRequest(
    `/api/poll-questions/${questionId}`,
    jsonRequest("PUT", { closes_at: closesAt }),
    m.admin_content_error_save(),
  );
  return response.json();
}

/** Delete a question; `confirmAnswers` is required when volunteers already answered it. */
export async function deletePollQuestion(
  questionId: string,

  confirmAnswers = false,
  notify = true,
): Promise<void> {
  await adminRequest(
    `/api/poll-questions/${questionId}?notify=${notify}${confirmAnswers ? "&confirm_answers=true" : ""}`,
    { method: "DELETE" },
    m.admin_content_error_save(),
  );
}

export async function reorderPollQuestions(
  editionId: string,
  orderedIds: string[],
): Promise<PollQuestion[]> {
  const response = await adminRequest(
    "/api/poll-questions/reorder",
    jsonRequest("POST", { edition_id: editionId, ordered_ids: orderedIds }),
    m.admin_content_error_save(),
  );
  const data: PollQuestion[] = await response.json();
  return Array.isArray(data) ? data : [];
}

/** Copy the questions (with their options) of another edition; returns the questions created. */
export async function copyPollQuestions(
  fromEditionId: string,
  toEditionId: string,
): Promise<PollQuestion[]> {
  const response = await adminRequest(
    "/api/poll-questions/copy",
    jsonRequest("POST", { from_edition_id: fromEditionId, to_edition_id: toEditionId }),
    m.admin_content_error_save(),
  );
  const data: PollQuestion[] = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createPollOption(
  payload: { questionId: string } & PollOptionWrite,
): Promise<PollOption> {
  const response = await adminRequest(
    "/api/poll-options",
    jsonRequest("POST", { question_id: payload.questionId, ...pollOptionBody(payload) }),
    m.admin_content_error_save(),
  );
  return response.json();
}

export async function updatePollOption(
  optionId: string,
  write: PollOptionWrite,
): Promise<PollOption> {
  const response = await adminRequest(
    `/api/poll-options/${optionId}`,
    jsonRequest("PUT", pollOptionBody(write)),
    m.admin_content_error_save(),
  );
  return response.json();
}

/** Delete an option; `confirmSelections` is required when volunteers already picked it. */
export async function deletePollOption(
  optionId: string,

  confirmSelections = false,
  notify = true,
): Promise<void> {
  await adminRequest(
    `/api/poll-options/${optionId}?notify=${notify}${confirmSelections ? "&confirm_selections=true" : ""}`,
    { method: "DELETE" },
    m.admin_content_error_save(),
  );
}

export async function reorderPollOptions(
  questionId: string,
  orderedIds: string[],
): Promise<PollOption[]> {
  const response = await adminRequest(
    "/api/poll-options/reorder",
    jsonRequest("POST", { question_id: questionId, ordered_ids: orderedIds }),
    m.admin_content_error_save(),
  );
  const data: PollOption[] = await response.json();
  return Array.isArray(data) ? data : [];
}

/** A volunteer's answer to a yes/no question; `attending` null means not answered. */
export interface PollAttendance {
  attending: boolean | null;
  /** Everyone a yes stands for, the volunteer included. */
  people: number;
}

export type PollOrders = import("@/api-types").PollOrdersOut;

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
): Promise<void> {
  await adminRequest(
    `/api/poll-questions/orders/${encodeURIComponent(volunteerId)}?edition_id=${encodeURIComponent(editionId)}`,
    jsonRequest("PUT", {
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
    }),
    m.admin_content_error_save(),
  );
}

export async function fetchPollOrders(editionId: string, locale: string): Promise<PollOrders> {
  const response = await adminRequest(
    `/api/poll-questions/orders?edition_id=${encodeURIComponent(editionId)}&locale=${encodeURIComponent(locale)}`,
    {},
    m.admin_content_error_load(),
  );
  return response.json();
}

export async function fetchVolunteerPollEvents(): Promise<Event[]> {
  const response = await adminRequest("/api/events", {}, m.admin_content_error_load());
  const events = (await response.json()) as Event[];
  return events.filter((event) => event.volunteers_only);
}

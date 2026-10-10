import { apiToEdition, type Edition } from "@/components/admin/editionTypes";
import type { ItemDraft } from "@/components/admin/itemTypes";
import type { Language, LocalizedText } from "@/components/admin/LocalizedFields";
import { m } from "@/paraglide/messages";
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
      // A body of literal `null` parses successfully, so the catch never fires —
      // coalesce it away rather than reading `.detail` off null.
      const data = (await response.json().catch(() => null)) ?? {};
      const detail = (data as { detail?: string }).detail;
      const errorMsg = detail ?? operation ?? m.admin_api_request_failed();
      throw new Error(errorMsg);
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
    description_language: (d.description_language as ItemDraft["description_language"]) ?? null,
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
    description_language: draft.description_language || null,
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
    organizationIds: number[];
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
 * Per-language title and description, as sent on both create and update. Blank
 * translations are sent as `null`, which clears them on update. The description
 * language is only sent with text, so clearing every description text clears it.
 */
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

function hasAnyText(text: LocalizedText): boolean {
  return Object.values(text).some((value) => value.trim());
}

export function eventTextBody(formData: EventFormData) {
  const text = (value: string) => value.trim() || null;
  const hasDescription = [
    formData.descriptionNl,
    formData.descriptionFr,
    formData.descriptionEn,
  ].some((value) => value.trim());
  return {
    title_language: formData.titleLanguage,
    title_nl: text(formData.titleNl),
    title_fr: text(formData.titleFr),
    title_en: text(formData.titleEn),
    description_language: hasDescription ? formData.descriptionLanguage : null,
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
  nameLanguage: Language;
  /** Per-language product name; a blank translation is cleared. */
  name: LocalizedText;
  descriptionLanguage: Language;
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
    name_language: payload.nameLanguage,
    ...localizedBody("name", payload.name),
    // Without any description text there is no description language either.
    ...(hasAnyText(payload.description)
      ? { description_language: payload.descriptionLanguage }
      : { description_language: null }),
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

export interface PollOption {
  id: string;
  editionId: string;
  label: string;
  /** Sum of every volunteer's quantity: what to order from the caterer. */
  totalQuantity: number;
  /** How many volunteers picked it. */
  volunteerCount: number;
}

function apiToPollOption(data: Record<string, unknown>): PollOption {
  return {
    id: String(data.id ?? ""),
    editionId: String(data.edition_id ?? ""),
    label: String(data.label ?? ""),
    totalQuantity: Number(data.total_quantity ?? 0),
    volunteerCount: Number(data.volunteer_count ?? 0),
  };
}

export async function fetchEditionPollOptions(
  editionId: string,
  authHeaders: () => Record<string, string>,
): Promise<PollOption[]> {
  const response = await safeFetch(
    `/api/poll-options?edition_id=${encodeURIComponent(editionId)}`,
    { headers: authHeaders() },
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToPollOption) : [];
}

export async function createPollOption(
  payload: { editionId: string; label: string },
  authHeaders: () => Record<string, string>,
): Promise<PollOption> {
  const response = await safeFetch(
    "/api/poll-options",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ edition_id: payload.editionId, label: payload.label }),
    },
    m.admin_content_error_save(),
  );
  return apiToPollOption((await response.json()) as Record<string, unknown>);
}

export async function updatePollOption(
  optionId: string,
  label: string,
  authHeaders: () => Record<string, string>,
): Promise<PollOption> {
  const response = await safeFetch(
    `/api/poll-options/${optionId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ label }),
    },
    m.admin_content_error_save(),
  );
  return apiToPollOption((await response.json()) as Record<string, unknown>);
}

export async function deletePollOption(
  optionId: string,
  authHeaders: () => Record<string, string>,
): Promise<void> {
  await safeFetch(
    `/api/poll-options/${optionId}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_content_error_save(),
  );
}

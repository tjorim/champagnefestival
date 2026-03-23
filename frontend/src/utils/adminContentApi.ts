import { apiToEdition, type Edition } from "@/components/admin/editionTypes";
import type { ItemDraft } from "@/components/admin/itemTypes";
import { m } from "@/paraglide/messages";
import { apiToEvent, type Event, type EventFormData } from "@/types/event";

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
      const data = await response.json().catch(() => ({}));
      const detail = (data as { detail?: string }).detail;
      const errorMsg = detail ?? (operation ? `Failed to ${operation}` : "Request failed");
      throw new Error(errorMsg);
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(operation ? `Failed to ${operation}` : "Network error occurred");
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
  const response = await safeFetch(`/api/${sectionKey}`, { headers: authHeaders() }, `load ${sectionKey}`);
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
        `save ${sectionKey}`,
      )
    : await safeFetch(
        `/api/${sectionKey}/${draft.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        },
        `update ${sectionKey}`,
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
    `update ${sectionKey} status`,
  );

  return apiToItemDraft((await response.json()) as Record<string, unknown>);
}

export async function deleteContentSectionItem(
  sectionKey: string,
  id: number,
  authHeaders: () => Record<string, string>,
): Promise<number> {
  await safeFetch(`/api/${sectionKey}/${id}`, { method: "DELETE", headers: authHeaders() }, `delete ${sectionKey}`);
  return id;
}

export async function fetchEditions(
  authHeaders: () => Record<string, string>,
): Promise<Edition[]> {
  const response = await safeFetch(
    "/api/editions?include_inactive=true",
    { headers: authHeaders() },
    "load editions",
  );

  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToEdition) : [];
}

interface ApiExhibitor {
  id: number;
  name: string;
  active?: boolean;
  type?: string;
}

export async function fetchEditionModalExhibitors(
  authHeaders: () => Record<string, string>,
): Promise<ItemDraft[]> {
  const response = await safeFetch("/api/exhibitors", { headers: authHeaders() }, "load exhibitors");

  const data = (await response.json()) as ApiExhibitor[];
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
    exhibitorIds: number[];
    externalPartner?: string;
    externalContactName?: string;
    externalContactEmail?: string;
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
        external_partner: payload.externalPartner?.trim() || null,
        external_contact_name: payload.externalContactName?.trim() || null,
        external_contact_email: payload.externalContactEmail?.trim() || null,
        active: payload.active,
        ...(payload.editionType === "festival"
          ? { exhibitors: payload.exhibitorIds }
          : {}),
      }),
    },
    isEdit ? "update edition" : "create edition",
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
        title: payload.formData.title.trim(),
        description: payload.formData.description.trim(),
        date: payload.formData.date,
        start_time: payload.formData.startTime,
        end_time: payload.formData.endTime || null,
        category: payload.formData.category.trim(),
        location: payload.formData.location?.trim() || null,
        presenter: payload.formData.presenter?.trim() || null,
        registration_required: payload.formData.registrationRequired,
        registrations_open_from:
          payload.formData.registrationRequired && payload.formData.registrationsOpenFrom
            ? payload.formData.registrationsOpenFrom
            : null,
        max_capacity: (() => {
          if (!payload.formData.registrationRequired || !payload.formData.maxCapacity) return null;
          const n = Number(payload.formData.maxCapacity);
          return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
        })(),
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

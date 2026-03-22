import { m } from "@/paraglide/messages";
import type { Edition } from "@/components/admin/editionTypes";
import type { ItemDraft } from "@/components/admin/itemTypes";

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
  const response = await fetch(`/api/${sectionKey}`, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to load ${sectionKey}: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(apiToItemDraft) : [];
}

export async function saveContentSectionItem(
  sectionKey: string,
  draft: ItemDraft,
  authHeaders: () => Record<string, string>,
): Promise<ItemDraft> {
  const isNew = draft.id <= 0;
  const response = isNew
    ? await fetch(`/api/${sectionKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: draft.name,
          image: draft.image,
          website: draft.website ?? "",
          type: draft.type ?? "vendor",
          contact_person_id: draft.contactPersonId ?? null,
        }),
      })
    : await fetch(`/api/${sectionKey}/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: draft.name,
          image: draft.image,
          website: draft.website ?? "",
          type: draft.type ?? "vendor",
          contact_person_id: draft.contactPersonId ?? null,
        }),
      });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }

  return apiToItemDraft((await response.json()) as Record<string, unknown>);
}

export async function updateContentSectionItemActive(
  sectionKey: string,
  id: number,
  active: boolean,
  authHeaders: () => Record<string, string>,
): Promise<ItemDraft> {
  const response = await fetch(`/api/${sectionKey}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ active }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }

  return apiToItemDraft((await response.json()) as Record<string, unknown>);
}

export async function deleteContentSectionItem(
  sectionKey: string,
  id: number,
  authHeaders: () => Record<string, string>,
): Promise<number> {
  const response = await fetch(`/api/${sectionKey}/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }

  return id;
}

export async function fetchEditions(
  authHeaders: () => Record<string, string>,
): Promise<Edition[]> {
  const response = await fetch("/api/editions?include_inactive=true", { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to load editions: ${response.status}`);
  }

  const data = (await response.json()) as Edition[];
  return Array.isArray(data) ? data : [];
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
  const response = await fetch("/api/exhibitors", { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to load exhibitors: ${response.status}`);
  }

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
    friday: string;
    saturday: string;
    sunday: string;
    venueId: string;
    active: boolean;
    exhibitorIds: number[];
  },
  authHeaders: () => Record<string, string>,
  initialId?: string,
): Promise<Edition> {
  const isEdit = Boolean(initialId);
  const response = await fetch(isEdit ? `/api/editions/${initialId}` : "/api/editions", {
    method: isEdit ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      ...(isEdit ? {} : { id: payload.id }),
      year: payload.year,
      month: payload.month,
      friday: payload.friday,
      saturday: payload.saturday,
      sunday: payload.sunday,
      venue_id: payload.venueId,
      active: payload.active,
      exhibitors: payload.exhibitorIds,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }

  return (await response.json()) as Edition;
}

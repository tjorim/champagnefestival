import type { Edition, EditionCreate } from "@/api-types";
import type { SponsorTier } from "@/config/editions";
import { m } from "@/paraglide/messages";
import { adminRequest } from "./adminApi";

export async function fetchEditions(): Promise<Edition[]> {
  const response = await adminRequest(
    "/api/editions?include_inactive=true",
    {},
    m.admin_api_load_editions(),
  );

  const data = (await response.json()) as Edition[];
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

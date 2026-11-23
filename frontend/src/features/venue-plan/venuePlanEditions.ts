import type { EditionPublicOut } from "@/api-types";
import { SESSION_EXPIRED_ERROR, UNAUTHORIZED_ERROR } from "@/lib/api/adminApi";
import { fetchEditions } from "@/lib/api/adminContentApi";
import { ApiError } from "@/lib/api/apiErrors";
import { m } from "@/paraglide/messages";
import { editionDisplayName } from "@/lib/editions/editionName";

// Kept apart from `venuePlanApi`, which the router imports eagerly: these helpers belong to the
// lazily loaded venue plan page and pull in the admin and error-code modules.

export interface VenuePlanEditionChoice {
  id: string;
  label: string;
}

function editionChoice(
  edition: Pick<EditionPublicOut, "id" | "month" | "year" | "venue">,
): VenuePlanEditionChoice {
  return { id: edition.id, label: `${editionDisplayName(edition)} · ${edition.venue.name}` };
}

/**
 * Editions to offer when the page is opened without a valid one. Admins may open any edition; the
 * admin listing is closed to volunteers, who get the public upcoming editions instead.
 */
export async function fetchVenuePlanEditionChoices(
  isAdmin: boolean,
): Promise<VenuePlanEditionChoice[]> {
  if (isAdmin) {
    return (await fetchEditions()).map(editionChoice);
  }
  const response = await fetch("/api/editions/upcoming");
  if (!response.ok) throw new ApiError(m.venue_plan_editions_error(), { status: response.status });
  const editions: EditionPublicOut[] = await response.json();
  return Array.isArray(editions) ? editions.map(editionChoice) : [];
}

/** Why a venue-plan read failed, so the page can offer sign-in, an explanation or a retry. */
export function venuePlanFailure(error: unknown): "expired" | "forbidden" | "not-found" | "other" {
  if (error instanceof Error && error.message === SESSION_EXPIRED_ERROR) return "expired";
  if (error instanceof Error && error.message === UNAUTHORIZED_ERROR) return "forbidden";
  if (error instanceof ApiError && error.status === 404) return "not-found";
  return "other";
}

import { queryOptions } from "@tanstack/react-query";
import {
  fetchJsonOrThrowWithUnauthorized,
  SESSION_EXPIRED_ERROR,
  UNAUTHORIZED_ERROR,
} from "@/utils/adminApi";
import { fetchEditions } from "@/utils/adminContentApi";
import { ApiError } from "@/utils/apiErrors";
import { m } from "@/paraglide/messages";

export interface VenuePlanTable {
  exclusive?: boolean;
  id: string;
  name: string;
  capacity: number;
  x: number;
  y: number;
  rotation: number;
  registration_ids: string[];
  occupied_seats: number;
}

export interface VenuePlanLayout {
  event_id: string;
  event_title: string;
  id: string;
  date: string | null;
  label: string;
  room: { id: string; name: string; width_m: number; length_m: number; color: string } | null;
  tables: VenuePlanTable[];
  areas: Array<{ id: string; label: string; icon: string; x: number; y: number; rotation: number }>;
}

export interface VenuePlan {
  edition_id: string;
  layouts: VenuePlanLayout[];
}

export function fetchVenuePlan(
  editionId: string,
  authHeaders: () => Record<string, string>,
): Promise<VenuePlan> {
  return fetchJsonOrThrowWithUnauthorized<VenuePlan>(
    `/api/venue-plan/${encodeURIComponent(editionId)}`,
    { headers: authHeaders() },
    m.venue_plan_error(),
  );
}

/**
 * Single source of truth for the venue-plan query's key/fetcher, shared by
 * the router loader's prefetch (`ensureQueryData`) and the page component's
 * `useQuery` — keeps the two from drifting apart (see
 * https://tkdodo.eu/blog/reliable-query-prefetching-with-tanstack-router).
 */
export function venuePlanQueryOptions(
  editionId: string,
  authHeaders: () => Record<string, string>,
) {
  return queryOptions({
    queryKey: ["venue-plan", editionId],
    queryFn: () => fetchVenuePlan(editionId, authHeaders),
    retry: false,
    // Without this, useQuery's default staleTime: 0 refetches immediately on
    // mount regardless of what the loader just prefetched, defeating the
    // point. Matches CheckInPage's staleTime for the same kind of query.
    staleTime: 30 * 1000,
  });
}

export interface VenuePlanEditionChoice {
  id: string;
  label: string;
}

function editionChoice(edition: {
  id: string;
  month: string;
  year: number;
  venue: { name: string };
}): VenuePlanEditionChoice {
  return { id: edition.id, label: `${edition.month} ${edition.year} · ${edition.venue.name}` };
}

/**
 * Editions to offer when the page is opened without a valid one. Admins may open any edition; the
 * admin listing is closed to volunteers, who get the public upcoming editions instead.
 */
export async function fetchVenuePlanEditionChoices(
  isAdmin: boolean,
  authHeaders: () => Record<string, string>,
): Promise<VenuePlanEditionChoice[]> {
  if (isAdmin) return (await fetchEditions(authHeaders)).map(editionChoice);
  const response = await fetch("/api/editions/upcoming");
  if (!response.ok) throw new ApiError(m.venue_plan_editions_error(), { status: response.status });
  const editions = (await response.json()) as Parameters<typeof editionChoice>[0][];
  return Array.isArray(editions) ? editions.map(editionChoice) : [];
}

/** Why a venue-plan read failed, so the page can offer sign-in, an explanation or a retry. */
export function venuePlanFailure(error: unknown): "expired" | "forbidden" | "not-found" | "other" {
  if (error instanceof Error && error.message === SESSION_EXPIRED_ERROR) return "expired";
  if (error instanceof Error && error.message === UNAUTHORIZED_ERROR) return "forbidden";
  if (error instanceof ApiError && error.status === 404) return "not-found";
  return "other";
}

import { queryOptions } from "@tanstack/react-query";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
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

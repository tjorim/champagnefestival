import type { VenuePlanTableOut, VenuePlanLayoutOut, VenuePlanOut } from "@/api-types";
import { queryOptions } from "@tanstack/react-query";
import { fetchJsonOrThrowWithUnauthorized } from "@/lib/api/adminApi";
import { m } from "@/paraglide/messages";

export type VenuePlanTable = VenuePlanTableOut;

export type VenuePlanLayout = VenuePlanLayoutOut;

export type VenuePlan = VenuePlanOut;

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

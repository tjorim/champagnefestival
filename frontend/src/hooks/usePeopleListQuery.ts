import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchPeopleCounts,
  fetchPeoplePage,
  type PeopleCountParams,
  type PeopleListParams,
} from "@/utils/adminPeopleQueries";
import { queryKeys } from "@/utils/queryKeys";

/** Server-owned filtering, ordering and totals; never filter a cached page locally. */
export function usePeopleListQuery(
  params: PeopleListParams,
  authHeaders: () => Record<string, string>,
  enabled = true,
) {
  const query = useQuery({
    queryKey: queryKeys.admin.peopleList(params),
    queryFn: ({ signal }) => fetchPeoplePage(authHeaders, params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
  // A disabled signed-out consumer must not expose placeholder rows.
  return { ...query, data: enabled ? query.data : undefined };
}

/** Omit a facet's own filter to obtain counts for its alternative tabs. */
export function usePeopleCountsQuery(
  params: PeopleCountParams,
  authHeaders: () => Record<string, string>,
  enabled = true,
) {
  const query = useQuery({
    queryKey: queryKeys.admin.peopleCounts(params),
    queryFn: ({ signal }) => fetchPeopleCounts(authHeaders, params, signal),
    enabled,
  });
  return { ...query, data: enabled ? query.data : undefined };
}

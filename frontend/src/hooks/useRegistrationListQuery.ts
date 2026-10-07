import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchRegistrationsPage, type RegistrationsPageOptions } from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";

/** Server-owned membership, order and totals; collections only overlay known rows. */
export function useRegistrationListQuery(
  options: RegistrationsPageOptions,
  authHeaders: () => Record<string, string>,
) {
  return useQuery({
    queryKey: queryKeys.admin.registrationsPage({
      q: options.query ?? "",
      status: options.status ?? "",
      personId: options.personId ?? "",
      editionId: options.editionId ?? "",
      eventDate: options.eventDate ?? "",
      editionCategory: options.editionCategory ?? "",
      sort: options.sort ?? "",
      sortDir: options.sortDir ?? "asc",
      page: options.page ?? 1,
      pageSize: options.limit ?? 50,
    }),
    queryFn: ({ signal }) => fetchRegistrationsPage(authHeaders, { ...options, signal }),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
    retry: false,
  });
}

/** Totals are counted by the existing server list endpoint; only one row per facet is requested. */
export function useRegistrationCountsQuery(
  editionId: string,
  today: string,
  authHeaders: () => Record<string, string>,
  enabled = true,
) {
  return useQuery({
    queryKey: [...queryKeys.admin.registrations, "counts", editionId, today],
    queryFn: async ({ signal }) => {
      const facets: Record<string, RegistrationsPageOptions> = {
        all: {},
        pending: { status: "pending" },
        confirmed: { status: "confirmed" },
        festival: { editionCategory: "festival" },
        standalone: { editionCategory: "standalone" },
        active: { editionId },
        today: { eventDate: today },
      };
      const counts = await Promise.all(
        Object.entries(facets).map(async ([name, options]) => {
          if (name === "active" && !editionId) return [name, 0] as const;
          const page = await fetchRegistrationsPage(authHeaders, { ...options, limit: 1, signal });
          return [name, page.total] as const;
        }),
      );
      return Object.fromEntries(counts) as Record<
        "all" | "pending" | "confirmed" | "festival" | "standalone" | "active" | "today",
        number
      >;
    },
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
}

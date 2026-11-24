import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { EventCheckInStats } from "@/api-types";
import {
  fetchEventCheckInStats,
  fetchRegistrationDashboardStats,
  fetchRegistrationsPage,
  type RegistrationsPageOptions,
} from "@/lib/api/adminFetch";
import { queryKeys } from "@/lib/query/queryKeys";

/** Server-owned membership, order and totals; collections only overlay known rows. */
export function useRegistrationListQuery(options: RegistrationsPageOptions) {
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
    queryFn: ({ signal }) => fetchRegistrationsPage({ ...options, signal }),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
    retry: false,
  });
}

export function useRegistrationCountsQuery(
  editionId: string,
  today: string,

  enabled = true,
) {
  return useQuery({
    queryKey: [...queryKeys.admin.registrationCounts, editionId, today],
    queryFn: ({ signal }) => fetchRegistrationDashboardStats(editionId, today, signal),
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function useVolunteerCheckInStats(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.eventCheckInStats,
    queryFn: () => fetchEventCheckInStats(),
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function summarizeGuestCheckIns(events: readonly EventCheckInStats[]) {
  return {
    checkedIn: events.reduce((sum, event) => sum + event.checked_in, 0),
    total: events.reduce((sum, event) => sum + event.total, 0),
  };
}

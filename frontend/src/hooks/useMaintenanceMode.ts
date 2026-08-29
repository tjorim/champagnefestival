/**
 * useMaintenanceMode — whether the public site should show the maintenance
 * placeholder instead of the full marketing page.
 *
 * Fails closed on a cold load during a genuine backend outage: the rest of
 * the public site (editions, schedule, registration) all depend on the same API, so if
 * `/api/settings` itself can't be reached, showing the static placeholder
 * is a better experience than a half-broken page. Client errors do not prove
 * maintenance is enabled, though, and a previously loaded value is retained
 * through transient failures.
 *
 * An already-open tab should also notice reasonably soon when an admin
 * flips the switch, so — unlike every other query in the app — this one
 * opts back into refetch-on-window-focus (the QueryClient default disables
 * it globally) and polls on an interval, on top of a short staleTime.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/utils/queryKeys";

interface ApiAppSettings {
  maintenance_mode: boolean;
}

export class SettingsHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Failed to load settings: ${status}`);
    this.name = "SettingsHttpError";
    this.status = status;
  }
}

export async function fetchMaintenanceMode(): Promise<boolean> {
  const res = await fetch("/api/settings");
  if (!res.ok) {
    throw new SettingsHttpError(res.status);
  }
  const api = (await res.json()) as ApiAppSettings;
  return api.maintenance_mode;
}

export function useMaintenanceMode(): { isMaintenanceMode: boolean; isLoaded: boolean } {
  const query = useQuery({
    queryKey: queryKeys.maintenanceMode,
    queryFn: fetchMaintenanceMode,
    staleTime: 15 * 1000,
    refetchInterval: (query) =>
      query.state.fetchFailureCount === 0
        ? 60 * 1000
        : Math.min(60 * 1000 * 2 ** query.state.fetchFailureCount, 5 * 60 * 1000),
    refetchOnWindowFocus: true,
    retry: (failureCount, error) =>
      !(error instanceof SettingsHttpError && error.status < 500) && failureCount < 2,
  });

  return {
    isMaintenanceMode:
      query.data ??
      (query.error instanceof SettingsHttpError ? query.error.status >= 500 : query.isError),
    isLoaded: query.status !== "pending",
  };
}

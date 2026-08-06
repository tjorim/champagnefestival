/**
 * useMaintenanceMode — whether the public site should show the maintenance
 * placeholder instead of the full marketing page.
 *
 * Fails closed on a genuine backend outage: the rest of the public site
 * (editions, schedule, registration) all depend on the same API, so if
 * `/api/settings` itself can't be reached, showing the static placeholder
 * is a better experience than a half-broken page — this is the one hook
 * in the app that intentionally does NOT fall back to "business as usual"
 * on error. A couple of retries first, so one dropped request doesn't flip
 * the whole site over.
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

export async function fetchMaintenanceMode(): Promise<boolean> {
  const res = await fetch("/api/settings");
  if (!res.ok) {
    throw new Error(`Failed to load settings: ${res.status}`);
  }
  const api = (await res.json()) as ApiAppSettings;
  return api.maintenance_mode;
}

export function useMaintenanceMode(): { isMaintenanceMode: boolean; isLoaded: boolean } {
  const query = useQuery({
    queryKey: queryKeys.maintenanceMode,
    queryFn: fetchMaintenanceMode,
    staleTime: 15 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  return {
    isMaintenanceMode: query.data ?? query.isError,
    isLoaded: query.status !== "pending",
  };
}

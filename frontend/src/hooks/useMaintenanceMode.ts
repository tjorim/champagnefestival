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
    staleTime: 60 * 1000,
    retry: 2,
  });

  return {
    isMaintenanceMode: query.data ?? query.isError,
    isLoaded: query.status !== "pending",
  };
}

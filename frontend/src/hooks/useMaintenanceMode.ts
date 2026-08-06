/**
 * useMaintenanceMode — whether the public site should show the maintenance
 * placeholder instead of the full marketing page.
 *
 * Fails open: while loading or on error, treats the site as not in
 * maintenance, consistent with how the rest of the public site treats a
 * fetch failure (fall back to something visible rather than blocking).
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
    retry: false,
  });

  return {
    isMaintenanceMode: query.data ?? false,
    isLoaded: query.status !== "pending",
  };
}

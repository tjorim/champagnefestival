import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { adminCachePersistence } from "@/state/adminCachePersistence";
import { Alert } from "@/components/ui/alert";
import * as m from "@/paraglide/messages";

export function AdminCacheStatus() {
  const cache = adminCachePersistence(useQueryClient());
  const status = useSyncExternalStore(cache.subscribe, cache.getSnapshot);
  // Only worth a banner when saved rows stand in for fresh data; otherwise the last sync time is a
  // quiet line beside the refresh button in the sidebar.
  if (!status.lastSynced || !status.restored) return null;
  return (
    <Alert role="status" variant="info" className="text-sm">
      {status.restored ? m.admin_cache_restored() + " " : ""}
      {m.admin_cache_last_synced({ time: new Date(status.lastSynced).toLocaleString() })}
    </Alert>
  );
}

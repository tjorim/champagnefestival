import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { adminCachePersistence } from "@/state/adminCachePersistence";
import { Alert } from "@/components/ui/alert";
import * as m from "@/paraglide/messages";

export function AdminCacheStatus() {
  const cache = adminCachePersistence(useQueryClient());
  const status = useSyncExternalStore(cache.subscribe, cache.getSnapshot);
  if (!status.lastSynced) return null;
  return (
    <Alert role="status" variant="info" className="text-sm">
      {status.restored ? m.admin_cache_restored() + " " : ""}
      {m.admin_cache_last_synced({ time: new Date(status.lastSynced).toLocaleString() })}
    </Alert>
  );
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  canPatchAdminRegistrationLiveEvent,
  patchAdminRegistrationLiveEvent,
} from "@/state/adminRegistrationsCollection";
import {
  canPatchAdminTableLiveEvent,
  isTableRowUnaffectedByLiveEvent,
  patchAdminTableLiveEvent,
} from "@/state/adminTablesCollection";
import { queryKeys } from "@/utils/queryKeys";
import { connectLiveStream } from "@/utils/liveStream";

const LIVE_STREAM_URL = "/api/live/stream";

// All keys invalidated on reconnect to recover any events missed during a gap.
const ALL_LIVE_KEYS = [
  queryKeys.admin.registrations,
  queryKeys.admin.tables,
  queryKeys.admin.people,
] as const;

/**
 * Side-effect component — renders nothing.
 * Mount once inside a shared layout route for admin/check-in routes so route
 * changes do not tear down the SSE connection. Opens GET /api/live/stream
 * when authenticated and
 * incrementally patches the active admin registrations and tables collections
 * when possible, and falls back to queryClient.invalidateQueries() for other
 * keys or failures.
 */
export function LiveUpdatesProvider(): null {
  const queryClient = useQueryClient();
  const { isAuthenticated, getAccessToken } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();

    connectLiveStream({
      url: LIVE_STREAM_URL,
      getToken: getAccessToken,
      signal: controller.signal,
      onInvalidate(envelope) {
        if (envelope.keys.some((key) => key[0] === "admin" && key[1] === "registrations")) {
          queryClient.invalidateQueries({ queryKey: queryKeys.admin.editionStats });
        }
        const isQuerySuccess = queryClient
          .getQueriesData({
            queryKey: [...queryKeys.admin.registrations, "edition"],
          })
          .some(([key]) => queryClient.getQueryState(key)?.status === "success");
        const canPatchRegistration = isQuerySuccess && canPatchAdminRegistrationLiveEvent(envelope);
        const tablesQueryState = queryClient.getQueryState(queryKeys.admin.tables);
        const canPatchTable =
          tablesQueryState?.status === "success" && canPatchAdminTableLiveEvent(envelope);
        // Allocation changes never alter a stored table row: occupancy is
        // derived from the registrations, so the tables key needs no work.
        const skipTablesKey = isTableRowUnaffectedByLiveEvent(envelope);

        for (const key of envelope.keys) {
          const isAdminRegistrationsKey =
            key.length === queryKeys.admin.registrations.length &&
            key.every((part, index) => part === queryKeys.admin.registrations[index]);
          const isAdminTablesKey =
            key.length === queryKeys.admin.tables.length &&
            key.every((part, index) => part === queryKeys.admin.tables[index]);

          if (isAdminTablesKey) {
            if (!canPatchTable && !skipTablesKey) queryClient.invalidateQueries({ queryKey: key });
          } else if (!canPatchRegistration || !isAdminRegistrationsKey) {
            queryClient.invalidateQueries({ queryKey: key });
          } else {
            // Patching keeps the collection's rows fresh, but the server-counted
            // check-in stats nested under this key are skipped along with it —
            // a check-in changes them, so refetch them explicitly.
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.eventCheckInStats });
            queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.registrations, "page"] });
            queryClient.invalidateQueries({
              queryKey: [...queryKeys.admin.registrations, "counts"],
            });
            queryClient.invalidateQueries({
              queryKey: [...queryKeys.admin.registrations, "layout-event"],
            });
          }
        }

        const authHeaders = () => {
          const token = getAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>);
        };

        if (canPatchTable) {
          void patchAdminTableLiveEvent(envelope, authHeaders).catch(() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.tables });
          });
        }

        if (!canPatchRegistration) return;

        void patchAdminRegistrationLiveEvent(envelope, authHeaders).catch(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.admin.registrations });
        });
      },
      onReconnect() {
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.editionStats });
        for (const key of ALL_LIVE_KEYS) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      },
    });

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, getAccessToken, queryClient]);

  return null;
}

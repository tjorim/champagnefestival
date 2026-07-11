import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  canPatchAdminRegistrationLiveEvent,
  patchAdminRegistrationLiveEvent,
} from "@/state/adminRegistrationsCollection";
import { queryKeys } from "@/utils/queryKeys";
import { connectLiveStream } from "@/utils/liveStream";

const LIVE_STREAM_URL = "/api/live/stream";

// All keys invalidated on reconnect to recover any events missed during a gap.
const ALL_LIVE_KEYS = [queryKeys.admin.registrations, queryKeys.admin.tables] as const;

/**
 * Side-effect component — renders nothing.
 * Mount once inside QueryClientProvider above the router so route changes do not
 * tear down the SSE connection. Opens GET /api/live/stream when authenticated and
 * incrementally patches the active admin registrations collection when possible,
 * and falls back to queryClient.invalidateQueries() for other keys or failures.
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
        const queryState = queryClient.getQueryState(queryKeys.admin.registrations);
        const isQuerySuccess = queryState?.status === "success";
        const canPatchRegistration =
          isQuerySuccess && canPatchAdminRegistrationLiveEvent(envelope);

        for (const key of envelope.keys) {
          const isAdminRegistrationsKey =
            key.length === queryKeys.admin.registrations.length &&
            key.every((part, index) => part === queryKeys.admin.registrations[index]);

          if (!canPatchRegistration || !isAdminRegistrationsKey) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        }

        if (!canPatchRegistration) return;

        void patchAdminRegistrationLiveEvent(envelope, () => {
          const token = getAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>);
        }).catch(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.admin.registrations });
        });
      },
      onReconnect() {
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

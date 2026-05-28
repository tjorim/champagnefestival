import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/utils/queryKeys";
import { connectLiveStream } from "@/utils/liveStream";

const LIVE_STREAM_URL = "/api/live/stream";

// All keys invalidated on reconnect to recover any events missed during a gap.
const ALL_LIVE_KEYS = [queryKeys.admin.registrations, queryKeys.admin.tables] as const;

/**
 * Side-effect component — renders nothing.
 * Mount once inside QueryClientProvider on event-day operational routes
 * (/admin, /check-in).  Opens GET /api/live/stream when authenticated and
 * calls queryClient.invalidateQueries() for each key in received envelopes.
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
        for (const key of envelope.keys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
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

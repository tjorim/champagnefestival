import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AdminField, AdminLabel, AdminSelect, AdminOption } from "./AdminFields";
import {
  signageRequest,
  fetchJsonOrThrowWithUnauthorized,
  downloadFileOrThrow,
} from "@/utils/adminApi";
import { apiErrorMessage } from "@/utils/apiErrors";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import type { Channel } from "@/signage/playlistModel";
import type { Playlist } from "@/signage/types";

type State =
  | "preparing"
  | "submitted"
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "cancelled"
  | "expired";
interface Job {
  id: string;
  channel_name: string;
  locale: string;
  state: State;
  retrying?: boolean;
  expires_at: string;
  slide_count: number;
  duration_seconds: number;
}
const queryKey = ["admin", "signage", "video-exports"];
const active = (state: State) => ["preparing", "submitted", "queued", "running"].includes(state);

export default function SignageVideoExports({
  channels,
  authHeaders,
}: {
  channels: Channel[];
  authHeaders: () => Record<string, string>;
}) {
  const client = useQueryClient();
  const [channelId, setChannelId] = useState("");
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const currentJob = useRef<string | null>(null);
  const identity = useRef<{ channelId: string; locale: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const capability = useQuery({
    queryKey: [...queryKey, "capability"],
    queryFn: ({ signal }) =>
      signageRequest<{ available: boolean; max_slides: number; max_seconds: number }>(
        "video-exports/capability",
        authHeaders(),
        "GET",
        undefined,
        signal,
      ),
  });
  const jobs = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      signageRequest<Job[]>("video-exports", authHeaders(), "GET", undefined, signal),
    refetchInterval: 3000,
  });
  useEffect(() => () => controller.current?.abort(), []);
  const refresh = () => client.invalidateQueries({ queryKey });
  const labels: Record<State, string> = {
    preparing: m.signage_video_preparing(),
    submitted: m.signage_video_submitted(),
    queued: m.signage_video_queued(),
    running: m.signage_video_running(),
    ready: m.signage_video_ready(),
    failed: m.signage_video_failed(),
    cancelled: m.signage_video_cancelled(),
    expired: m.signage_video_expired(),
  };
  async function start() {
    const locale = getLocale();
    if (
      !identity.current ||
      identity.current.channelId !== channelId ||
      identity.current.locale !== locale
    ) {
      identity.current = { channelId, locale, key: crypto.randomUUID() };
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setPhase(m.signage_video_preparing());
    try {
      const job = await fetchJsonOrThrowWithUnauthorized<Job & { playlist: Playlist }>(
        "/api/signage/video-exports",
        {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
            "Idempotency-Key": identity.current.key,
          },
          body: JSON.stringify({ channel_id: channelId, locale }),
          signal: abort.signal,
        },
        m.signage_video_error(),
      );
      currentJob.current = job.id;
      await refresh();
      if (job.state === "preparing") {
        const { renderSlideImages } = await import("@/signage/export");
        let totalBytes = 0;
        await renderSlideImages(job.playlist, {
          signal: abort.signal,
          onSlide: async (index, bytes) => {
            totalBytes += bytes.length;
            if (bytes.length > 8 * 1024 ** 2 || totalBytes > 120 * 1024 ** 2)
              throw new Error("Capture limit");
            setPhase(m.signage_video_uploading({ current: index + 1, total: job.slide_count }));
            await fetchJsonOrThrowWithUnauthorized(
              `/api/signage/video-exports/${job.id}/slides/${index}`,
              {
                method: "PUT",
                headers: { ...authHeaders(), "Content-Type": "image/png" },
                body: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" }),
                signal: abort.signal,
              },
              m.signage_video_error(),
            );
            setPhase(m.signage_video_preparing());
          },
        });
        abort.signal.throwIfAborted();
        await signageRequest(
          `video-exports/${job.id}/submit`,
          authHeaders(),
          "POST",
          undefined,
          abort.signal,
        );
      }
      identity.current = null;
    } catch (failure) {
      if (!abort.signal.aborted) setError(apiErrorMessage(failure, m.signage_video_error()));
    } finally {
      currentJob.current = null;
      controller.current = null;
      setBusy(false);
      setPhase("");
      void refresh();
    }
  }
  async function cancel(id: string) {
    if (currentJob.current === id) controller.current?.abort();
    setError("");
    try {
      await signageRequest(`video-exports/${id}/cancel`, authHeaders(), "POST");
      identity.current = null;
      await refresh();
    } catch (failure) {
      setError(apiErrorMessage(failure, m.signage_video_error()));
    }
  }
  if (!capability.data?.available && !jobs.data?.length) return null;
  return (
    <section className="space-y-3 rounded border p-3" aria-label={m.signage_video_title()}>
      <h3>{m.signage_video_title()}</h3>
      <p>{m.signage_video_explanation()}</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {capability.data?.available && (
        <>
          <p>
            {m.signage_video_limits({
              count: capability.data.max_slides,
              seconds: capability.data.max_seconds,
            })}
          </p>
          <AdminField>
            <AdminLabel>{m.signage_video_channel()}</AdminLabel>
            <AdminSelect
              value={channelId}
              disabled={busy}
              onValueChange={(value) => setChannelId(value ?? "")}
            >
              <AdminOption value="">{m.signage_video_choose()}</AdminOption>
              {channels
                .filter((channel) => channel.active)
                .map((channel) => (
                  <AdminOption key={channel.id} value={channel.id}>
                    {channel.name}
                  </AdminOption>
                ))}
            </AdminSelect>
          </AdminField>
          <Button variant="outline" disabled={busy || !channelId} onClick={() => void start()}>
            {m.signage_video_download()}
          </Button>
        </>
      )}
      {phase && <p role="status">{phase}</p>}
      {jobs.data?.length ? (
        <ul className="space-y-2" aria-label={m.signage_video_history()}>
          {jobs.data.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-2">
              <span>
                {m.signage_video_status({
                  channel: job.channel_name,
                  locale: job.locale,
                  seconds: job.duration_seconds,
                  state: labels[job.state],
                })}
              </span>
              {job.retrying && active(job.state) && <span>{m.signage_video_retrying()}</span>}
              <time dateTime={job.expires_at}>
                {m.signage_video_until({
                  date: new Date(job.expires_at).toLocaleString(getLocale()),
                })}
              </time>
              {job.state === "ready" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    void downloadFileOrThrow(
                      `/api/signage/video-exports/${job.id}/download`,
                      { headers: authHeaders() },
                      m.signage_video_error(),
                      "signage.mp4",
                    ).catch((failure) =>
                      setError(apiErrorMessage(failure, m.signage_video_error())),
                    );
                  }}
                >
                  {m.signage_video_download()}
                </Button>
              )}
              {(active(job.state) || job.state === "ready") && (
                <Button variant="outline" onClick={() => void cancel(job.id)}>
                  {m.signage_video_cancel()}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import { estimateOffset, slideAtTime, type ClockSample } from "./clock";
import { playlistImages, type Playlist } from "./types";
import { SlideRenderer } from "./SlideRenderer";

const CACHE = "signage-playlists-v1";

async function prepare(playlist: Playlist) {
  // Do not switch revisions until every image has loaded successfully.
  await Promise.all(
    playlistImages(playlist).map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          const timeout = setTimeout(() => reject(new Error("Signage image timeout")), 8000);
          image.onload = () => {
            clearTimeout(timeout);
            resolve();
          };
          image.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Signage image unavailable"));
          };
          image.src = url;
        }),
    ),
  );
}

async function cacheShell(playlist: Playlist) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 10_000)),
  ]);
  if (!registration) return;
  const urls = [
    location.href,
    ...playlistImages(playlist),
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
  ];
  registration.active?.postMessage({ type: "signage-cache", urls });
}

export default function SignagePage() {
  const { channel } = useParams({ strict: false }) as { channel: string };
  const [slide, setSlide] = useState<Playlist["slides"][number]>();
  const [index, setIndex] = useState(-1);
  const [started, setStarted] = useState(false);
  const [awake, setAwake] = useState(false);
  const [healthy, setHealthy] = useState(false);
  const [scale, setScale] = useState(1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const resize = () => setScale(Math.min(innerWidth / 1920, innerHeight / 1080));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    let stopped = false;
    let lock: WakeLockSentinel | undefined;
    let requesting = false;
    const request = async () => {
      if (
        !started ||
        document.visibilityState !== "visible" ||
        !navigator.wakeLock ||
        requesting ||
        (lock && !lock.released)
      )
        return;
      try {
        requesting = true;
        const acquired = await navigator.wakeLock.request("screen");
        if (stopped) {
          void acquired.release();
          return;
        }
        lock = acquired;
        setAwake(true);
        acquired.addEventListener("release", () => setAwake(false));
      } catch {
        setAwake(false);
      } finally {
        requesting = false;
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, [started]);

  useEffect(() => {
    let disposed = false;
    let current: Playlist | undefined;
    let pending: { playlist: Playlist; boundary: number } | undefined;
    let etag: string | null = null;
    let offset = 0;
    try {
      const saved = Number(localStorage.getItem("signage-clock-offset"));
      offset = Number.isFinite(saved) ? saved : 0;
    } catch {
      /* Storage unavailable. */
    }
    let syncedAt = -Infinity;
    let connected = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const url = `/api/signage/${encodeURIComponent(channel)}/playlist?locale=${getLocale()}`;
    // Anchor the corrected clock to performance.now(), so later OS clock changes do not move it.
    const anchor = Date.now() - performance.now();
    const now = () => performance.now() + anchor + offset;
    const tick = () => {
      if (disposed) return;
      const time = now();
      if (pending && time >= pending.boundary) {
        current = pending.playlist;
        pending = undefined;
      }
      const position = slideAtTime(
        current?.slides.map((item) => item.duration) ?? [],
        Date.parse(current?.epoch ?? ""),
        time,
      );
      setIndex(position.index);
      setSlide(current?.slides[position.index]);
      setHealthy(connected && performance.now() - syncedAt < 360_000);
      clearTimeout(timer);
      timer = setTimeout(tick, Math.max(1, Math.min(position.remaining, 1000)));
    };
    const sync = async () => {
      try {
        const samples: ClockSample[] = [];
        for (let i = 0; i < 5; i++) {
          const sent = performance.now();
          const response = await fetch("/api/signage/time", {
            cache: "no-store",
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
          });
          if (!response.ok) throw new Error("Clock unavailable");
          const body = await response.json();
          const received = performance.now();
          const server = Date.parse(body.server_time);
          if (!Number.isFinite(server)) throw new Error("Invalid server clock");
          samples.push({ sent: sent + anchor, received: received + anchor, server });
        }
        if (disposed) return;
        offset = estimateOffset(samples);
        try {
          localStorage.setItem("signage-clock-offset", String(now() - Date.now()));
        } catch {
          /* Storage unavailable. */
        }
        syncedAt = performance.now();
        tick();
      } catch {
        /* Keep the last monotonic clock estimate. */
      }
    };
    let pollingNow = false;
    const poll = async () => {
      if (disposed || pollingNow) return;
      pollingNow = true;
      try {
        const response = await fetch(url, {
          headers: etag ? { "If-None-Match": etag } : {},
          cache: "no-cache",
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
        });
        if (response.status !== 304) {
          if (!response.ok) throw new Error("Playlist unavailable");
          const playlist: Playlist = await response.json();
          if (
            !Array.isArray(playlist.slides) ||
            !Number.isFinite(Date.parse(playlist.epoch)) ||
            playlist.slides.some((item) => !Number.isFinite(item.duration) || item.duration <= 0)
          )
            throw new Error("Invalid playlist");
          await prepare(playlist);
          void cacheShell(playlist).catch(() => {});
          if (disposed) return;
          if (!current) current = playlist;
          else if (playlist.revision !== current.revision)
            pending = {
              playlist,
              boundary:
                pending?.boundary ??
                slideAtTime(
                  current.slides.map((item) => item.duration),
                  Date.parse(current.epoch),
                  now(),
                ).boundary,
            };
          else pending = undefined;
          etag = response.headers.get("ETag");
          // Cache only a fully prepared revision; offline startup can use it immediately.
          try {
            const cache = await caches.open(CACHE);
            await cache.put(url, new Response(JSON.stringify(playlist)));
          } catch {
            /* Storage may be disabled. */
          }
        }
        connected = true;
      } catch {
        connected = false;
      }
      pollingNow = false;
      tick();
    };
    const online = () => {
      void sync();
      void poll();
    };
    const offline = () => {
      connected = false;
      tick();
    };
    const visible = () => {
      if (document.visibilityState === "visible") online();
    };
    void (async () => {
      try {
        const saved = await (await caches.open(CACHE)).match(url);
        if (saved) {
          const playlist: Playlist = await saved.json();
          await prepare(playlist);
          if (!disposed && !current) current = playlist;
        }
      } catch {
        /* First visit or unavailable storage. */
      }
      if (!disposed) {
        tick();
        await sync();
        if (!disposed) await poll();
      }
    })();
    const polling = setInterval(() => void poll(), 30_000);
    const syncing = setInterval(() => void sync(), 180_000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(timer);
      clearInterval(polling);
      clearInterval(syncing);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [channel]);

  return (
    <div ref={root} className="site-signage-screen" data-slide-index={index}>
      {/* oxlint-disable-next-line shadcn/no-inline-styles -- The fixed canvas scales to the measured viewport. */}
      <div className="site-signage-viewport" style={{ transform: `scale(${scale})` }}>
        {slide && <SlideRenderer slide={slide} />}
      </div>
      <span
        role="status"
        aria-label={healthy ? m.signage_synced() : m.signage_waiting()}
        title={healthy ? m.signage_synced() : m.signage_waiting()}
        className={`absolute bottom-2 right-2 size-2 rounded-full ${healthy ? "bg-success" : "bg-warning"}`}
      />
      {!started && (
        <div className="relative rounded-lg bg-background p-6 text-foreground shadow-lg">
          <Button
            onClick={() => {
              setStarted(true);
              void root.current?.requestFullscreen?.().catch(() => {});
            }}
          >
            {m.signage_start()}
          </Button>
          <p className="mt-3 max-w-md">{m.signage_setup()}</p>
        </div>
      )}
      {started && !awake && (
        <p className="absolute bottom-2 left-2 rounded bg-background px-2 text-xs text-foreground">
          {m.signage_sleep()}
        </p>
      )}
    </div>
  );
}

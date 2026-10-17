import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toBlob } from "html-to-image";
import { strToU8, zipSync } from "fflate";
import { SlideRenderer } from "./SlideRenderer";
import { slideAtTime } from "./clock";
import { playlistImages, type Playlist } from "./types";
import offlineTemplate from "./offline-player.html?raw";

export interface ExportPlaylist {
  revision: string;
  epoch: string;
  slides: { duration: number; image: string }[];
}

/** Embedded JSON and classic scripts work from file:// without fetching. */
export function offlineHtml(playlist: ExportPlaylist, start: string, setup: string) {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const values = {
    start: escape(start),
    setup: escape(setup),
    playlist: JSON.stringify(playlist).replaceAll("<", "\\u003c"),
  };
  return offlineTemplate.replace(
    /\{\{(start|setup|playlist)\}\}/g,
    (_, key: keyof typeof values) => values[key],
  );
}

/** Serialized after TypeScript compilation; depends only on its clock argument and browser APIs. */
function offlinePlayer(clock: typeof slideAtTime) {
  const playlist: ExportPlaylist = JSON.parse(document.getElementById("playlist")!.textContent!);
  const images = playlist.slides.map((slide) => {
    const image = new Image();
    image.src = slide.image;
    image.alt = "";
    image.hidden = true;
    document.body.prepend(image);
    return image;
  });
  function tick() {
    const position = clock(
      playlist.slides.map((slide) => slide.duration),
      Date.parse(playlist.epoch),
      Date.now(),
    );
    images.forEach((image, index) => {
      image.hidden = index !== position.index;
    });
    setTimeout(tick, Math.max(1, Math.min(position.remaining, 250)));
  }
  void Promise.all(images.map((image) => image.decode())).then(tick);
  let started = false;
  let lock: WakeLockSentinel | undefined;
  async function wake() {
    if (started && navigator.wakeLock && (!lock || lock.released)) {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* OS sleep is covered in setup guidance. */
      }
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void wake();
  });
  const button = document.querySelector("button")!;
  button.onclick = () => {
    started = true;
    void document.documentElement.requestFullscreen?.().catch(() => {});
    void wake();
    button.hidden = true;
    document.querySelector("p")!.hidden = true;
  };
}

// Both functions are deliberately self-contained for execution without app imports.
export function offlineScript() {
  return `(${offlinePlayer.toString()})(${slideAtTime.toString()});`;
}

/** Capture the live player's DOM/CSS at its native canvas resolution. */
export async function renderSlideImages(playlist: Playlist) {
  // Embed assets ourselves: capture libraries can silently omit failed fetches.
  const assets = new Map<string, string>();
  for (const url of playlistImages(playlist)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("Export image unavailable");
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Export image could not be read"));
      reader.readAsDataURL(blob);
    });
    assets.set(url, data);
  }
  const host = document.createElement("div");
  host.className = "site-signage-export";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  const root = createRoot(host);
  const files: Record<string, Uint8Array> = {};
  try {
    for (const [index, slide] of playlist.slides.entries()) {
      flushSync(() => root.render(<SlideRenderer slide={slide} />));
      for (const image of host.querySelectorAll("img")) {
        const source = image.getAttribute("src");
        if (source && assets.has(source)) image.src = assets.get(source)!;
      }
      await document.fonts.ready;
      await Promise.all([...host.querySelectorAll("img")].map((image) => image.decode()));
      const blob = await toBlob(host.firstElementChild as HTMLElement, {
        width: 1920,
        height: 1080,
        pixelRatio: 1,
        skipFonts: true,
      });
      if (!blob) throw new Error("Slide capture failed");
      files[`slides/${String(index + 1).padStart(3, "0")}.png`] = new Uint8Array(
        await blob.arrayBuffer(),
      );
    }
    return files;
  } finally {
    root.unmount();
    host.remove();
  }
}

export function exportArchive(
  playlist: Playlist,
  images: Record<string, Uint8Array>,
  bundle: boolean,
  labels: { start: string; setup: string },
) {
  const files = { ...images };
  if (bundle) {
    const frozen: ExportPlaylist = {
      revision: playlist.revision,
      epoch: playlist.epoch,
      slides: playlist.slides.map((slide, index) => ({
        duration: slide.duration,
        image: `slides/${String(index + 1).padStart(3, "0")}.png`,
      })),
    };
    files["playlist.json"] = strToU8(JSON.stringify(frozen, null, 2));
    files["index.html"] = strToU8(offlineHtml(frozen, labels.start, labels.setup));
    files["player.js"] = strToU8(offlineScript());
  }
  return zipSync(files, { level: 0 });
}

export async function downloadExport(
  playlist: Playlist,
  slug: string,
  bundle: boolean,
  labels: { start: string; setup: string },
) {
  if (!playlist.slides.length) throw new Error("Cannot export an empty playlist");
  const images = await renderSlideImages(playlist);
  const bytes = exportArchive(playlist, images, bundle, labels);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}-${bundle ? "offline" : "slides"}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

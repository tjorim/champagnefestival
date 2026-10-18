import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Network fixtures cover the admin UI; lifecycle/authorization use real Postgres in backend tests.
// Optional real-worker variables exercise the exact captured browser PNGs through apps#273.
test("captures a frozen playlist, finds the job after navigation, downloads and cancels", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const captured: Buffer[] = [];
  await page.exposeFunction("recordVideoSlide", (index: number, bytes: number[]) => {
    captured[index] = Buffer.from(bytes);
  });
  const playlist = {
    revision: "frozen-video",
    epoch: "2026-10-01T00:00:00Z",
    slides: [
      {
        id: "org",
        kind: "organization",
        duration: 1,
        text: null,
        title: null,
        image: null,
        icon: null,
        organization: {
          name: "Maison",
          logo: "/video-fixture.png",
          description: "Tradition",
          sponsor: true,
          sponsor_tier: "main",
        },
        template: {
          background: {
            kind: "image",
            color: "#ff0000",
            end_color: "#000000",
            image: "/video-fixture.png",
          },
          layers: [
            {
              id: "logo",
              kind: "binding",
              binding: "logo",
              x: 10,
              y: 10,
              width: 20,
              height: 20,
              rotation: 0,
              color: "#ffffff",
              font_size: 60,
            },
            {
              id: "name",
              kind: "binding",
              binding: "name",
              x: 35,
              y: 20,
              width: 60,
              height: 30,
              rotation: 0,
              color: "#ffffff",
              font_size: 60,
            },
          ],
        },
      },
      {
        id: "notice",
        kind: "notice",
        duration: 2,
        text: "Welcome",
        title: null,
        image: null,
        icon: "info",
        organization: null,
        translations: {
          text_language: "en",
          text_nl: "Welkom",
          text_fr: "Bienvenue",
          text_en: "Welcome",
        },
        template: {
          background: { kind: "color", color: "#00ff00", end_color: "#000000", image: null },
          layers: [
            {
              id: "text",
              kind: "binding",
              binding: "text",
              x: 10,
              y: 30,
              width: 70,
              height: 50,
              rotation: 0,
              color: "#000000",
              font_size: 60,
            },
            {
              id: "icon",
              kind: "binding",
              binding: "icon",
              x: 80,
              y: 10,
              width: 10,
              height: 10,
              rotation: 0,
              color: "#000000",
              font_size: 60,
            },
          ],
        },
      },
    ],
  };
  await page.addInitScript((snapshot) => {
    const original = window.fetch;
    const json = (value: unknown, status = 200) =>
      Promise.resolve(
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url === "/api/signage/channels")
        return json([
          {
            id: "video-channel",
            slug: "video",
            name: "Video channel",
            active: true,
            edition_id: "edition",
            epoch: snapshot.epoch,
            revision: 1,
          },
        ]);
      if (url === "/video-fixture.png") {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 4;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, 4, 4);
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((value) => resolve(value!)),
        );
        return new Response(blob);
      }
      if (url.startsWith("/api/signage/video/playlist")) return json(snapshot);
      if (!url.startsWith("/api/signage/video-exports")) return original(input, init);
      const key = "video-test-job";
      const job = JSON.parse(localStorage.getItem(key) ?? "null");
      if (url.endsWith("/capability"))
        return json({ available: true, max_slides: 60, max_seconds: 600 });
      if (url === "/api/signage/video-exports" && init?.method === "POST") {
        const value = job ?? {
          id: "job-test",
          channel_name: "Video channel",
          locale: "en",
          state: "preparing",
          slide_count: 2,
          duration_seconds: 3,
          expires_at: "2026-12-31T00:00:00Z",
          playlist: snapshot,
        };
        localStorage.setItem(key, JSON.stringify(value));
        return json(value, 201);
      }
      if (url === "/api/signage/video-exports") return json(job ? [job] : []);
      if (url.includes("/slides/")) {
        const index = Number(url.split("/").at(-1));
        const bytes = [...new Uint8Array(await (init?.body as Blob).arrayBuffer())];
        await (
          window as unknown as {
            recordVideoSlide: (index: number, bytes: number[]) => Promise<void>;
          }
        ).recordVideoSlide(index, bytes);
        return json(job);
      }
      if (url.endsWith("/submit") || url.endsWith("/cancel")) {
        job.state = url.endsWith("/submit") ? "queued" : "cancelled";
        localStorage.setItem(key, JSON.stringify(job));
        return json(job);
      }
      if (url.endsWith("/download")) {
        const bytes = Uint8Array.from(
          atob(localStorage.getItem("video-test-output") ?? "bXA0"),
          (char) => char.charCodeAt(0),
        );
        return new Response(bytes, { headers: { "Content-Type": "video/mp4" } });
      }
      return json(job);
    };
  }, playlist);
  async function openChannels() {
    await page.goto("/admin");
    await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
    const content = page.getByRole("button", { name: "Content", exact: true });
    if ((await content.getAttribute("aria-expanded")) !== "true") await content.click();
    await page.getByRole("button", { name: "Screen channels", exact: true }).click();
  }
  await openChannels();
  await page.getByRole("combobox", { name: "Published channel", exact: true }).click();
  await page.getByRole("option", { name: "Video channel", exact: true }).click();
  await page.getByRole("button", { name: "Download video (MP4)", exact: true }).click();
  const history = page.getByRole("list", { name: "Your video exports" });
  await expect(history).toContainText("Queued");
  expect(captured).toHaveLength(2);
  for (const bytes of captured) {
    expect(bytes.readUInt32BE(16)).toBe(1920);
    expect(bytes.readUInt32BE(20)).toBe(1080);
  }
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download slide images", exact: true }).click();
  const pngStream = await (await pngDownload).createReadStream();
  const pngChunks: Buffer[] = [];
  for await (const chunk of pngStream) pngChunks.push(chunk);
  const pngFiles = unzipSync(Buffer.concat(pngChunks));
  expect(Buffer.from(pngFiles["slides/001.png"]!)).toEqual(captured[0]);
  expect(Buffer.from(pngFiles["slides/002.png"]!)).toEqual(captured[1]);
  await openChannels();
  await expect(history).toContainText("Queued");
  let output = Buffer.from("mp4");
  const workerUrl = process.env.MEDIA_WORKER_TEST_URL;
  const tokenFile = process.env.MEDIA_WORKER_TEST_TOKEN_FILE;
  if (workerUrl && tokenFile) {
    const headers = { Authorization: `Bearer ${(await readFile(tokenFile, "utf8")).trim()}` };
    const manifest = { profile: "signage-slideshow-v1", durations_ms: [1000, 2000] };
    const canonical = JSON.stringify({
      manifest: { durations_ms: manifest.durations_ms, profile: manifest.profile },
      sha256: captured.map((bytes) => createHash("sha256").update(bytes).digest("hex")),
    });
    const form = new FormData();
    form.append("manifest", JSON.stringify(manifest));
    captured.forEach((bytes) =>
      form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "slide.png"),
    );
    const submit = await fetch(`${workerUrl}/v1/jobs`, {
      method: "POST",
      headers: {
        ...headers,
        "Idempotency-Key": randomUUID(),
        "X-Payload-SHA256": createHash("sha256").update(canonical).digest("hex"),
      },
      body: form,
    });
    expect(submit.status).toBe(202);
    const worker = (await submit.json()) as { id: string };
    try {
      await expect
        .poll(
          async () => {
            const response = await fetch(`${workerUrl}/v1/jobs/${worker.id}`, { headers });
            const value = (await response.json()) as { state: string };
            return value.state;
          },
          { timeout: 60_000, intervals: [500] },
        )
        .toBe("succeeded");
      const response = await fetch(`${workerUrl}/v1/jobs/${worker.id}/artifacts/video.mp4`, {
        headers,
      });
      output = Buffer.from(await response.arrayBuffer());
      const path = testInfo.outputPath("signage.mp4");
      await writeFile(path, output);
      const probe = JSON.parse(
        execFileSync(
          "ffprobe",
          ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
          { encoding: "utf8" },
        ),
      );
      expect(probe.streams).toHaveLength(1);
      expect(probe.streams[0]).toMatchObject({
        codec_name: "h264",
        pix_fmt: "yuv420p",
        width: 1920,
        height: 1080,
        r_frame_rate: "30/1",
        nb_frames: "90",
      });
      expect(Number(probe.format.duration)).toBeCloseTo(3, 2);
      const frames = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        path,
        "-vf",
        "crop=2:2:0:0",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]);
      expect(frames.length).toBe(90 * 12);
      for (let frame = 0; frame < 90; frame++) {
        // Exactly 30 red frames, then 60 green frames, including the final hold.
        expect(frames[frame * 12 + (frame < 30 ? 0 : 1)]).toBeGreaterThan(240);
        expect(frames[frame * 12 + (frame < 30 ? 1 : 0)]).toBeLessThan(15);
      }
      // Inspect both the first hold and final hold in Chromium's actual video decoder.
      const colours = await page.evaluate(async (base64) => {
        const video = document.createElement("video");
        video.muted = true;
        video.src = `data:video/mp4;base64,${base64}`;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("Cannot decode video"));
        });
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext("2d")!;
        const pixels: number[][] = [];
        for (const time of [0.5, 1, 2.9]) {
          const seeked = new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
          });
          video.currentTime = time;
          await seeked;
          ctx.drawImage(video, 0, 0);
          pixels.push([...ctx.getImageData(0, 0, 1, 1).data]);
        }
        return pixels;
      }, output.toString("base64"));
      expect(colours[0]![0]).toBeGreaterThan(180);
      expect(colours[0]![1]).toBeLessThan(80);
      expect(colours[1]![1]).toBeGreaterThan(180);
      expect(colours[1]![0]).toBeLessThan(80);
      expect(colours[2]![1]).toBeGreaterThan(180);
      expect(colours[2]![0]).toBeLessThan(80);
    } finally {
      await fetch(`${workerUrl}/v1/jobs/${worker.id}/artifacts`, { method: "DELETE", headers });
    }
  }
  await page.evaluate((base64) => {
    localStorage.setItem("video-test-output", base64);
    const job = JSON.parse(localStorage.getItem("video-test-job")!);
    job.state = "ready";
    localStorage.setItem("video-test-job", JSON.stringify(job));
  }, output.toString("base64"));
  await page.reload();
  await openChannels();
  await expect(history).toContainText("Ready to download");
  const downloading = page.waitForEvent("download");
  await history.getByRole("button", { name: "Download video (MP4)", exact: true }).click();
  const stream = await (await downloading).createReadStream();
  const downloaded: Buffer[] = [];
  for await (const chunk of stream) downloaded.push(chunk);
  expect(Buffer.concat(downloaded)).toEqual(output);
  await history.getByRole("button", { name: "Cancel / remove export", exact: true }).click();
  await expect(history).toContainText("Cancelled");
});

import { test, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("exports rendered PNGs and plays an extracted bundle offline using the system clock", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const playlist = {
    revision: "export-test",
    epoch: "2026-10-01T00:00:00Z",
    slides: [0, 1].map((index) => ({
      id: String(index),
      kind: "notice",
      duration: index + 2,
      title: null,
      text: `Slide ${index}`,
      image: null,
      icon: null,
      organization: null,
      template: {
        background: {
          kind: "color",
          color: index ? "#ffffff" : "#000000",
          end_color: "#000000",
          image: null,
        },
        layers: [
          {
            id: "text",
            kind: "binding",
            binding: "text",
            x: 10,
            y: 30,
            width: 80,
            height: 40,
            rotation: 0,
            color: "#ff0000",
            font_size: 80,
          },
        ],
      },
    })),
  };
  await page.addInitScript((snapshot) => {
    const original = window.fetch;
    window.fetch = (input, init) =>
      String(input).includes("/playlist?")
        ? Promise.resolve(
            new Response(JSON.stringify(snapshot), {
              headers: { "Content-Type": "application/json" },
            }),
          )
        : original(input, init);
  }, playlist);
  await page.goto("/admin");
  await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
  const content = page.getByRole("button", { name: "Content", exact: true });
  if ((await content.getAttribute("aria-expanded")) !== "true") await content.click();
  await page.getByRole("button", { name: "Screen channels", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add channel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add channel", exact: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Export test");
  await page.getByLabel("Public link name").fill("export-test");
  await page.getByRole("combobox", { name: "Edition", exact: true }).click();
  await page.getByRole("option").filter({ hasText: "2027" }).first().click();
  await page.getByRole("button", { name: "Save channel", exact: true }).click();
  const folder = await mkdtemp(join(tmpdir(), "signage-export-"));
  const context = await browser.newContext();
  try {
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download offline bundle", exact: true }).last().click();
    const download = await downloading;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const files = unzipSync(Buffer.concat(chunks));
    expect(Object.keys(files).sort()).toEqual([
      "index.html",
      "player.js",
      "playlist.json",
      "slides/001.png",
      "slides/002.png",
    ]);
    expect(JSON.parse(strFromU8(files["playlist.json"]!)).epoch).toBe(playlist.epoch);
    await mkdir(join(folder, "slides"));
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(folder, name), bytes);
    for (const name of ["slides/001.png", "slides/002.png"]) {
      const png = Buffer.from(files[name]!);
      expect(png.readUInt32BE(16)).toBe(1920);
      expect(png.readUInt32BE(20)).toBe(1080);
    }
    await context.setOffline(true);
    const local = await context.newPage();
    const errors: string[] = [];
    local.on("pageerror", (error) => errors.push(error.message));
    const requests: string[] = [];
    local.on("request", (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await local.clock.install({ time: new Date("2026-10-01T00:00:01Z") });
    await local.goto(pathToFileURL(join(folder, "index.html")).href);
    await expect(local.locator("img:not([hidden])")).toHaveAttribute("src", "slides/001.png");
    const colours = await local.evaluate(
      async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 1080;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, 1920, 1080).data;
        let red = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index]! > 200 && pixels[index + 1]! < 30 && pixels[index + 2]! < 30) red++;
        }
        return { corner: [...pixels.slice(0, 4)], red };
      },
      `data:image/png;base64,${Buffer.from(files["slides/001.png"]!).toString("base64")}`,
    );
    expect(colours.corner).toEqual([0, 0, 0, 255]);
    expect(colours.red).toBeGreaterThan(100);
    await local.clock.runFor(1200);
    await expect(local.locator("img:not([hidden])")).toHaveAttribute("src", "slides/002.png");
    await local.clock.runFor(3000);
    await expect(local.locator("img:not([hidden])")).toHaveAttribute("src", "slides/001.png");
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  } finally {
    await context.close();
    await rm(folder, { recursive: true, force: true });
  }
});

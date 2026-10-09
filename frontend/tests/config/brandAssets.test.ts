/// <reference types="node" />
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The sharing image and icons were once text placeholders that nothing noticed. These
// tests open every file the HTML, manifest and JSON-LD point at and check that it is a
// real image of the declared size. Regenerate with docs/brand/make_brand_assets.py.

const publicDir = join(import.meta.dirname, "..", "..", "public");

type Format = "png" | "jpeg" | "ico";
interface ImageInfo {
  format: Format;
  width: number;
  height: number;
}

const read = (relativePath: string) => readFileSync(join(publicDir, relativePath));

function pngInfo(file: Buffer): ImageInfo | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (file.length < 24 || !file.subarray(0, 8).equals(signature)) return null;
  return { format: "png", width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

function jpegInfo(file: Buffer): ImageInfo | null {
  if (file.length < 4 || file.readUInt16BE(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 9 < file.length) {
    if (file[offset] !== 0xff) return null;
    const marker = file.readUInt8(offset + 1);
    // SOF0-SOF15 carry the frame size, except DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        format: "jpeg",
        width: file.readUInt16BE(offset + 7),
        height: file.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + file.readUInt16BE(offset + 2);
  }
  return null;
}

/** Largest frame in an .ico directory (a 0 width or height byte means 256). */
function icoSizes(file: Buffer): number[] | null {
  if (file.length < 6 || file.readUInt16LE(0) !== 0 || file.readUInt16LE(2) !== 1) return null;
  const count = file.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => file[6 + i * 16] || 256);
}

function imageInfo(relativePath: string): ImageInfo | null {
  const file = read(relativePath);
  return pngInfo(file) ?? jpegInfo(file);
}

describe("sharing image", () => {
  it("og-image.jpg is a 1200x630 JPEG under 300 KB", () => {
    expect(imageInfo("images/og-image.jpg")).toEqual({ format: "jpeg", width: 1200, height: 630 });
    expect(statSync(join(publicDir, "images/og-image.jpg")).size).toBeLessThan(300 * 1024);
  });
});

describe("icons", () => {
  const sized = [
    ["icons/favicon-16x16.png", 16],
    ["icons/favicon-32x32.png", 32],
    ["icons/favicon-48x48.png", 48],
    ["icons/apple-touch-icon.png", 180],
  ] as const;

  it.each(sized)("%s is a real %i px PNG", (path, size) => {
    expect(imageInfo(path)).toEqual({ format: "png", width: size, height: size });
  });

  it("favicon.ico holds 16, 32 and 48 px frames", () => {
    expect([...(icoSizes(read("icons/favicon.ico")) ?? [])].sort((a, b) => a - b)).toEqual([
      16, 32, 48,
    ]);
  });

  it("every web manifest icon is a PNG of its declared size", () => {
    const manifest = JSON.parse(read("site.webmanifest").toString("utf8")) as {
      icons: { src: string; sizes: string; type: string }[];
    };
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(icon.type).toBe("image/png");
      expect(imageInfo(icon.src.replace(/^\//, ""))).toEqual({ format: "png", width, height });
    }
  });

  it("logo.svg, the broken-image fallback, is an SVG without the old placeholder gradient", () => {
    const svg = read("images/logo.svg").toString("utf8");
    expect(svg.trimStart()).toMatch(/^<svg\b/);
    expect(svg).not.toContain("linearGradient");
  });
});

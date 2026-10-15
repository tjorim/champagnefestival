import { describe, expect, it } from "vitest";
import { emptyTemplate, missingBindings, newLayer, validTemplate } from "./editorModel";

describe("signage template requirements", () => {
  it("requires the sponsor slot because organisation playlists include sponsors", () => {
    const draft = emptyTemplate();
    draft.layers = [newLayer("binding", "logo"), newLayer("binding", "name")];
    expect(missingBindings(draft, "organizations")).toEqual(["sponsor"]);
    draft.layers.push(newLayer("binding", "sponsor"));
    expect(missingBindings(draft, "organizations")).toEqual([]);
    draft.layers[0]!.visible = false;
    expect(missingBindings(draft, "organizations")).toEqual(["logo"]);
  });
  it("does not count a static sticker's stale binding", () => {
    const draft = emptyTemplate();
    draft.layers = [newLayer("text", "title"), newLayer("binding", "text")];
    expect(missingBindings(draft, "notice")).toEqual(["title"]);
    expect(missingBindings(draft, "image")).toEqual([]);
  });
});

it("resizes along rotated axes while keeping the opposite corner anchored", async () => {
  const { resizeLayer } = await import("./editorModel");
  const layer = { ...newLayer("shape"), x: 30, y: 30, rotation: 90 };
  const result = resizeLayer(layer, 0, 192);
  expect(result.width).toBeCloseTo(50);
  expect(result.height).toBeCloseTo(20);
  expect(result.x).toBeCloseTo(25);
  expect(result.y).toBeCloseTo(30 + (96 / 1080) * 100);
});

it("validates the same bounded layer document before saving", () => {
  const draft = { ...emptyTemplate(), name: "Festival", layers: [newLayer("text")] };
  expect(validTemplate(draft)).toBe(true);
  draft.layers[0]!.width = 0;
  expect(validTemplate(draft)).toBe(false);
  draft.layers[0]!.width = 40;
  draft.layers.push({ ...draft.layers[0]! });
  expect(validTemplate(draft)).toBe(false);
  draft.layers.pop();
  draft.layers[0]!.kind = "image";
  expect(validTemplate(draft)).toBe(false);
  draft.layers[0]!.image = "/uploads/signage/" + "a".repeat(32) + "-" + "b".repeat(64) + ".jpg";
  expect(validTemplate(draft)).toBe(true);
  draft.layers[0]!.x = Number.NaN;
  expect(validTemplate(draft)).toBe(false);
});

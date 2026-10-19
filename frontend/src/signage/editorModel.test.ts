import { describe, expect, it } from "vitest";
import {
  addMissingBindings,
  moveLayer,
  emptyTemplate,
  missingBindings,
  newLayer,
  validTemplate,
} from "./editorModel";

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

describe("layer panel edits", () => {
  it("adds distinct starter slots, restores hidden layers and preserves existing artwork", () => {
    const hidden = { ...newLayer("binding", "logo"), visible: false, x: 7 };
    const draft = { ...emptyTemplate(), layers: [hidden] };
    const next = addMissingBindings(draft, "organizations");
    expect(missingBindings(next, "organizations")).toEqual([]);
    expect(next.layers).toHaveLength(3);
    expect(next.layers[0]).toMatchObject({ id: hidden.id, visible: true, x: 7 });
    expect(next.layers[1]!.y).not.toBe(next.layers[2]!.y);
    expect(draft.layers[0]!.visible).toBe(false);
    expect(addMissingBindings(next, "organizations")).toEqual(next);
  });
  it("leaves locked hidden slots intact and respects the layer limit", () => {
    const locked = { ...newLayer("binding", "title"), visible: false, locked: true };
    const next = addMissingBindings({ ...emptyTemplate(), layers: [locked] }, "notice");
    expect(next.layers[0]).toEqual(locked);
    expect(missingBindings(next, "notice")).toEqual([]);
    const full = {
      ...emptyTemplate(),
      layers: Array.from({ length: 100 }, () => newLayer("text")),
    };
    expect(addMissingBindings(full, "notice").layers).toHaveLength(100);
    full.layers[0] = { ...newLayer("binding", "title"), visible: false };
    expect(addMissingBindings(full, "notice").layers[0]!.visible).toBe(true);
  });
  it("moves layers without changing identities or the source array, and protects locked sources", () => {
    const layers = [newLayer("text"), newLayer("shape"), newLayer("icon")];
    const moved = moveLayer(layers, 0, 2);
    expect(moved).toEqual([layers[1], layers[2], layers[0]]);
    expect(layers[0]!.kind).toBe("text");
    expect(moveLayer(layers, 0, 3)).toBe(layers);
    expect(moveLayer(layers, -1, 0)).toBe(layers);
    layers[0]!.locked = true;
    expect(moveLayer(layers, 0, 1)).toBe(layers);
  });
});

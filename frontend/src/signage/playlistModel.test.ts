import { describe, expect, it } from "vitest";
import { emptySlide, validSlide, moveSlide, localSchedule } from "./playlistModel";
describe("playlist editing contracts", () => {
  it("requires original notice content, bounded duration and ordered schedule", () => {
    const slide = { ...emptySlide("hall", 0), template_id: "template", kind: "notice" as const };
    expect(validSlide(slide)).toBe(false);
    slide.content.text_nl = "Geen honden";
    expect(validSlide(slide)).toBe(true);
    slide.duration = 1.5;
    expect(validSlide(slide)).toBe(false);
    slide.duration = 10;
    slide.content.title_fr = "Attention";
    expect(validSlide(slide)).toBe(false);
    slide.content.title_nl = "Opgelet";
    slide.starts_at = "2026-10-16T12:00:00Z";
    slide.ends_at = "2026-10-16T12:00:00Z";
    expect(validSlide(slide)).toBe(false);
    slide.ends_at = "2026-10-16T13:00:00Z";
    expect(validSlide(slide)).toBe(true);
  });
  it("moves to the drop position without mutating or losing rows", () => {
    const rows = ["a", "b", "c"];
    expect(moveSlide(rows, 0, 2)).toEqual(["b", "c", "a"]);
    expect(rows).toEqual(["a", "b", "c"]);
    expect(moveSlide(rows, -1, 2)).toBe(rows);
  });
  it("round trips local schedule inputs as the same instant", () => {
    const instant = "2026-10-16T12:00:00Z";
    expect(new Date(localSchedule(instant)).toISOString()).toBe(new Date(instant).toISOString());
    expect(localSchedule(null)).toBe("");
  });
});

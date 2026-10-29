import { describe, expect, it } from "vitest";
import { editionDisplayName } from "./editionName";

describe("editionDisplayName", () => {
  it("capitalises the month and appends the year", () => {
    expect(editionDisplayName({ year: 2027, month: "march" })).toBe("March 2027");
  });

  it("keeps the rest of the month as typed", () => {
    expect(editionDisplayName({ year: 2026, month: " maart " })).toBe("Maart 2026");
    expect(editionDisplayName({ year: 2026, month: "Spring 2nd" })).toBe("Spring 2nd 2026");
  });

  it("leaves out a missing month or year instead of printing a gap", () => {
    expect(editionDisplayName({ year: 2027, month: "" })).toBe("2027");
    expect(editionDisplayName({ year: 0, month: "march" })).toBe("March");
  });
});

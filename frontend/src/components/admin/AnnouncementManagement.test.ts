import { describe, expect, it } from "vitest";

import { iso, localDate } from "./AnnouncementManagement";

describe("announcement datetime-local conversion", () => {
  it("round-trips a UTC timestamp through local wall time without shifting the instant", () => {
    const utc = "2026-09-02T15:30:00.000Z";
    const brusselsSummerOffsetMinutes = -120;
    expect(localDate(utc, brusselsSummerOffsetMinutes)).toBe("2026-09-02T17:30");
    expect(iso(localDate(utc, brusselsSummerOffsetMinutes), brusselsSummerOffsetMinutes)).toBe(utc);
  });

  it("keeps missing timestamps empty", () => {
    expect(localDate(null)).toBe("");
    expect(iso(null)).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/editions", () => ({
  EMPTY_EDITION: {
    id: "",
    year: 2026,
    month: "march",
    dates: [],
    venue: {
      venueName: "",
      address: "",
      city: "",
      postalCode: "",
      country: "",
      coordinates: { lat: 0, lng: 0 },
    },
    schedule: [],
    producers: [],
    sponsors: [],
  },
}));

describe("config/dates", () => {
  it("returns empty/null values when the fallback edition has no dates", async () => {
    const { festivalDate, festivalEndDate, festivalDays, festivalDateRange } = await import(
      "@/config/dates"
    );

    expect(festivalDate).toBeNull();
    expect(festivalEndDate).toBeNull();
    expect(festivalDays).toEqual([]);
    expect(festivalDateRange).toEqual({ en: "", fr: "", nl: "" });
  });
});

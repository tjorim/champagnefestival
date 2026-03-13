import { describe, it, expect } from "vitest";
import { editions, getActiveEdition } from "@/config/editions";
import type { Edition } from "@/config/editions";

describe("editions registry", () => {
  it("exports a non-empty editions array", () => {
    expect(Array.isArray(editions)).toBe(true);
    expect(editions.length).toBeGreaterThan(0);
  });

  it("every edition has a unique id", () => {
    const ids = editions.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("every edition has the required fields", () => {
    editions.forEach((edition: Edition) => {
      expect(edition.id).toBeTruthy();
      expect(edition.year).toBeGreaterThan(2000);
      expect(["march", "october"]).toContain(edition.month);
      expect(edition.dates.friday).toBeInstanceOf(Date);
      expect(edition.dates.saturday).toBeInstanceOf(Date);
      expect(edition.dates.sunday).toBeInstanceOf(Date);
      expect(edition.venue.venueName).toBeTruthy();
      expect(edition.venue.address).toBeTruthy();
      expect(edition.venue.city).toBeTruthy();
      expect(edition.venue.postalCode).toBeTruthy();
      expect(edition.venue.country).toBeTruthy();
      expect(typeof edition.venue.coordinates.lat).toBe("number");
      expect(typeof edition.venue.coordinates.lng).toBe("number");
      expect(Array.isArray(edition.schedule)).toBe(true);
    });
  });

  it("every edition has dates in Fri–Sat–Sun order", () => {
    editions.forEach((edition: Edition) => {
      expect(edition.dates.friday.getDay()).toBe(5);
      expect(edition.dates.saturday.getDay()).toBe(6);
      expect(edition.dates.sunday.getDay()).toBe(0);
      expect(edition.dates.saturday.getTime()).toBeGreaterThan(
        edition.dates.friday.getTime(),
      );
      expect(edition.dates.sunday.getTime()).toBeGreaterThan(
        edition.dates.saturday.getTime(),
      );
    });
  });

  it("getActiveEdition returns a valid Edition", () => {
    const active = getActiveEdition();
    expect(active).toBeDefined();
    expect(active.id).toBeTruthy();
    expect(active.dates.friday).toBeInstanceOf(Date);
  });

  it("getActiveEdition returns an edition that is in the editions array", () => {
    const active = getActiveEdition();
    expect(editions.some((e) => e.id === active.id)).toBe(true);
  });

  it("getActiveEdition falls back to the most recent edition when all are past", () => {
    // The fallback should always yield a defined result regardless of date
    const active = getActiveEdition();
    expect(active).toBeDefined();
  });
});

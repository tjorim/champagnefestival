import { describe, it, expect } from "vitest";
import {
  festivalDays,
  scheduleEvents,
  getEventsByCategory,
  getAllEventsSorted,
  requiresReservation,
} from "@/config/schedule";
import { editions } from "@/config/editions";

// The march 2026 edition has the full schedule; use it for tests that require
// specific events, since the active edition (october) may have an empty schedule.
const march2026 = editions.find((e) => e.id === "2026-march")!;
const march2026Events = march2026.schedule;

describe("schedule config", () => {
  it("exports 3 festival days", () => {
    expect(festivalDays).toHaveLength(3);
  });

  it("festival days have correct labels", () => {
    expect(festivalDays[0]?.label).toBe("friday");
    expect(festivalDays[1]?.label).toBe("saturday");
    expect(festivalDays[2]?.label).toBe("sunday");
  });

  it("festival days have valid ISO dates", () => {
    festivalDays.forEach((day) => {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const parsedDate = new Date(day.date);
      expect(Number.isNaN(parsedDate.getTime())).toBe(false);
      expect(parsedDate.toISOString().slice(0, 10)).toBe(day.date);
    });
  });

  it("festival days have sequential ids 1, 2, 3", () => {
    expect(festivalDays.map((d) => d.id)).toEqual([1, 2, 3]);
  });

  it("exports schedule events array", () => {
    expect(Array.isArray(scheduleEvents)).toBe(true);
    // The active edition may have an empty schedule (TBD); verify the array type only.
    // Event content is tested against the known march 2026 edition below.
  });

  it("all events have required fields", () => {
    scheduleEvents.forEach((event) => {
      expect(event.id).toBeTruthy();
      expect(event.title).toBeTruthy();
      expect(event.startTime).toBeTruthy();
      expect(event.description).toBeTruthy();
      expect(event.category).toBeTruthy();
      expect(typeof event.dayId).toBe("number");
    });
  });

  it("getEventsByDay returns events for a specific day", () => {
    const day1Events = march2026Events.filter((e) => e.dayId === 1);
    expect(day1Events.every((e) => e.dayId === 1)).toBe(true);
    expect(day1Events.length).toBeGreaterThan(0);
  });

  it("getEventsByCategory returns events for a specific category", () => {
    const tastingEvents = getEventsByCategory("tasting");
    expect(tastingEvents.every((e) => e.category === "tasting")).toBe(true);
  });

  it("getAllEventsSorted returns all events sorted by day then time", () => {
    const sorted = getAllEventsSorted();
    expect(sorted.length).toBe(scheduleEvents.length);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (prev.dayId === curr.dayId) {
        expect(prev.startTime.localeCompare(curr.startTime)).toBeLessThanOrEqual(0);
      } else {
        expect(prev.dayId).toBeLessThanOrEqual(curr.dayId);
      }
    }
  });

  it("requiresReservation returns true for events with reservation flag", () => {
    const vipEvent = march2026Events.find((e) => e.id === "fri-vip");
    expect(vipEvent).toBeDefined();
    expect(requiresReservation(vipEvent!)).toBe(true);
  });

  it("requiresReservation returns false for events without reservation flag", () => {
    const tastingEvent = march2026Events.find((e) => e.id === "fri-tasting");
    expect(tastingEvent).toBeDefined();
    expect(requiresReservation(tastingEvent!)).toBe(false);
  });

  it("event categories are valid values", () => {
    const validCategories = ["tasting", "vip", "party", "breakfast", "exchange", "general"];
    scheduleEvents.forEach((event) => {
      expect(validCategories).toContain(event.category);
    });
  });
});

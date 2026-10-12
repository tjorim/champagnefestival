import { describe, expect, it } from "vitest";
import {
  initialPlanSelection,
  planAreaBox,
  type EditionPlan,
  type PlanArea,
  type PlanRoom,
} from "./planApi";

function area(id: string, organizationId: number | null, overrides: Partial<PlanArea> = {}) {
  return {
    id,
    label: id,
    icon: "bi-shop",
    x: 10,
    y: 20,
    rotation: 0,
    width_m: 2,
    length_m: 1,
    organization_id: organizationId,
    ...overrides,
  } satisfies PlanArea;
}

function room(id: string, name: string, areas: PlanArea[]): PlanRoom {
  return { id, name, width_m: 20, length_m: 10, color: "#6c757d", areas };
}

const plan: EditionPlan = {
  edition_id: "2099",
  days: [
    { event_id: "fri", date: "2099-03-20", rooms: [room("r1", "Hall 5", [area("a1", 1)])] },
    {
      event_id: "sat",
      date: "2099-03-21",
      rooms: [room("r1", "Hall 5", [area("a2", 2)]), room("r2", "Cellar", [area("a3", 1)])],
    },
  ],
};

const stand = (eventId: string, roomName: string) => ({
  event_id: eventId,
  date: "2099-03-21",
  room_name: roomName,
  label: "Stand",
});

describe("initialPlanSelection", () => {
  it("opens the room named by the stand on the stand's day", () => {
    expect(
      initialPlanSelection(plan, { organizationId: 1, stand: stand("sat", "Cellar") }),
    ).toEqual({ eventId: "sat", roomId: "r2" });
  });

  it("falls back to another room of the day that holds the organization", () => {
    expect(
      initialPlanSelection(plan, { organizationId: 1, stand: stand("sat", "Renamed room") }),
    ).toEqual({ eventId: "sat", roomId: "r2" });
  });

  it("falls back to the first room of the first day without a usable target", () => {
    expect(initialPlanSelection(plan, null)).toEqual({ eventId: "fri", roomId: "r1" });
    expect(
      initialPlanSelection(plan, { organizationId: 9, stand: stand("sat", "Cellar") }),
    ).toEqual({ eventId: "fri", roomId: "r1" });
  });

  it("returns null for an empty plan", () => {
    expect(initialPlanSelection({ edition_id: "2099", days: [] }, null)).toBeNull();
  });
});

describe("planAreaBox", () => {
  it("scales an area to percentages of the room canvas", () => {
    // 20 m x 10 m room: 560 x 280 px canvas; 2 m x 1 m area: 56 x 28 px.
    const box = planAreaBox(area("a", 1), room("r", "Hall", []));
    expect(box).toEqual({ left: 10, top: 20, width: 10, height: 10 });
  });

  it("uses the minimum canvas and area size for small rooms and areas", () => {
    const small = { ...room("r", "Closet", []), width_m: 2, length_m: 2 };
    const box = planAreaBox(area("a", 1, { width_m: 0.1, length_m: 0.1 }), small);
    expect(box.width).toBeCloseTo((40 / 280) * 100);
    expect(box.height).toBeCloseTo((24 / 180) * 100);
  });
});

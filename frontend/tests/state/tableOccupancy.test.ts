import { describe, expect, it } from "vitest";
import { deriveTableRegistrationIds, withTableOccupancy } from "@/state/tableOccupancy";
import type { FloorTableRecord } from "@/api-types";
import type { Registration } from "@/types/registration";
import { registrationRow } from "../utils/registrationFixtures";

function registration(id: string, tableIds: string[]): Registration {
  return registrationRow({
    id,
    allocations: tableIds.map((table_id) => ({ table_id, guest_count: 1, exclusive: false })),
  });
}

const table = (id: string): FloorTableRecord => ({
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  event_id: "event-1",
  id,
  name: id,
  capacity: 6,
  x: 10,
  y: 20,
  table_type_id: "tt-01",
  rotation: 0,
  layout_id: "layout-01",
});

describe("deriveTableRegistrationIds", () => {
  it("groups registrations by every table they are allocated to", () => {
    const byTable = deriveTableRegistrationIds([
      registration("reg-1", ["t1"]),
      registration("reg-2", ["t1", "t2"]),
      registration("reg-3", []),
    ]);

    expect(byTable.get("t1")).toEqual(["reg-1", "reg-2"]);
    expect(byTable.get("t2")).toEqual(["reg-2"]);
    expect(byTable.has("t3")).toBe(false);
  });

  it("lists a registration once even if it holds two allocations on one table", () => {
    expect(deriveTableRegistrationIds([registration("reg-1", ["t1", "t1"])]).get("t1")).toEqual([
      "reg-1",
    ]);
  });

  it("tolerates registrations without allocations", () => {
    expect(deriveTableRegistrationIds([{ id: "reg-1" } as Registration]).size).toBe(0);
  });
});

describe("withTableOccupancy", () => {
  it("joins stored rows with derived occupancy and leaves the rows untouched", () => {
    const rows = [table("t1"), table("t2")];
    const result = withTableOccupancy(rows, [registration("reg-1", ["t1"])]);

    expect(result.map((t) => [t.id, t.registration_ids])).toEqual([
      ["t1", ["reg-1"]],
      ["t2", []],
    ]);
    expect(rows[0]).not.toHaveProperty("registration_ids");
  });

  it("follows a moved registration from one table to another", () => {
    const rows = [table("t1"), table("t2")];
    const before = withTableOccupancy(rows, [registration("reg-1", ["t1"])]);
    const after = withTableOccupancy(rows, [registration("reg-1", ["t2"])]);

    expect(before[0]!.registration_ids).toEqual(["reg-1"]);
    expect(after.map((t) => t.registration_ids)).toEqual([[], ["reg-1"]]);
  });

  it("empties the table when the registration's allocation is removed", () => {
    const after = withTableOccupancy([table("t1")], [registration("reg-1", [])]);
    expect(after[0]!.registration_ids).toEqual([]);
  });
});

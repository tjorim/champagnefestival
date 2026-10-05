import { describe, expect, it } from "vitest";
import { deriveTableRegistrationIds, withTableOccupancy } from "@/state/tableOccupancy";
import type { FloorTableRecord } from "@/types/admin";
import type { Registration } from "@/types/registration";

function registration(id: string, tableIds: string[]): Registration {
  return {
    id,
    allocations: tableIds.map((tableId) => ({ tableId, guestCount: 1, exclusive: false })),
  } as Registration;
}

const table = (id: string): FloorTableRecord => ({
  id,
  name: id,
  capacity: 6,
  x: 10,
  y: 20,
  tableTypeId: "tt-01",
  rotation: 0,
  layoutId: "layout-01",
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

    expect(result.map((t) => [t.id, t.registrationIds])).toEqual([
      ["t1", ["reg-1"]],
      ["t2", []],
    ]);
    expect(rows[0]).not.toHaveProperty("registrationIds");
  });

  it("follows a moved registration from one table to another", () => {
    const rows = [table("t1"), table("t2")];
    const before = withTableOccupancy(rows, [registration("reg-1", ["t1"])]);
    const after = withTableOccupancy(rows, [registration("reg-1", ["t2"])]);

    expect(before[0]!.registrationIds).toEqual(["reg-1"]);
    expect(after.map((t) => t.registrationIds)).toEqual([[], ["reg-1"]]);
  });

  it("empties the table when the registration's allocation is removed", () => {
    const after = withTableOccupancy([table("t1")], [registration("reg-1", [])]);
    expect(after[0]!.registrationIds).toEqual([]);
  });
});

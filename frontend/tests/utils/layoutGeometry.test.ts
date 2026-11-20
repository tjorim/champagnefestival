import { describe, expect, it } from "vitest";
import type { FloorArea, FloorTable } from "@/api-types";
import { getTablesInArea } from "@/utils/layoutGeometry";

const canvasW = 280;
const canvasH = 180;

const baseArea: FloorArea = {
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  id: "area-1",
  layout_id: "layout-1",
  icon: "bi-shop",
  organization_id: null,
  label: "Stand",
  x: 40,
  y: (34 / canvasH) * 100,
  rotation: 0,
  width_m: 2,
  length_m: 4,
};

const tableToRightOfAreaCenter: FloorTable = {
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  event_id: "event-1",
  id: "table-1",
  name: "T1",
  capacity: 4,
  x: (169 / canvasW) * 100,
  y: (74 / canvasH) * 100,
  table_type_id: "missing-type",
  rotation: 0,
  layout_id: "layout-1",
  registration_ids: [],
};

describe("getTablesInArea", () => {
  it("excludes a table outside the unrotated area bounds", () => {
    expect(getTablesInArea(baseArea, [tableToRightOfAreaCenter], [], canvasW, canvasH)).toEqual([]);
  });

  it("includes the same table when area rotation brings it inside local bounds", () => {
    const rotatedArea = { ...baseArea, rotation: 90 };

    expect(getTablesInArea(rotatedArea, [tableToRightOfAreaCenter], [], canvasW, canvasH)).toEqual([
      tableToRightOfAreaCenter,
    ]);
  });
});

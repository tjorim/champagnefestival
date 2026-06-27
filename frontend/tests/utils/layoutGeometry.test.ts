import { describe, expect, it } from "vitest";
import type { FloorArea, FloorTable } from "@/types/admin";
import { getTablesInArea } from "@/utils/layoutGeometry";

const canvasW = 280;
const canvasH = 180;

const baseArea: FloorArea = {
  id: "area-1",
  layoutId: "layout-1",
  icon: "bi-shop",
  exhibitorId: null,
  label: "Stand",
  x: 40,
  y: 34 / canvasH * 100,
  rotation: 0,
  widthM: 2,
  lengthM: 4,
};

const tableToRightOfAreaCenter: FloorTable = {
  id: "table-1",
  name: "T1",
  capacity: 4,
  x: 169 / canvasW * 100,
  y: 74 / canvasH * 100,
  tableTypeId: "missing-type",
  rotation: 0,
  layoutId: "layout-1",
  registrationIds: [],
};

describe("getTablesInArea", () => {
  it("excludes a table outside the unrotated area bounds", () => {
    expect(
      getTablesInArea(baseArea, [tableToRightOfAreaCenter], [], canvasW, canvasH),
    ).toEqual([]);
  });

  it("includes the same table when area rotation brings it inside local bounds", () => {
    const rotatedArea = { ...baseArea, rotation: 90 };

    expect(
      getTablesInArea(rotatedArea, [tableToRightOfAreaCenter], [], canvasW, canvasH),
    ).toEqual([tableToRightOfAreaCenter]);
  });
});

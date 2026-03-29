import type { FloorTable, TableType } from "@/types/admin";

export const LAYOUT_PX_PER_M = 28;
export const LAYOUT_MIN_CANVAS_WIDTH_PX = 280;
export const LAYOUT_MIN_CANVAS_HEIGHT_PX = 180;
export const LAYOUT_MIN_AREA_WIDTH_PX = 40;
export const LAYOUT_MIN_AREA_HEIGHT_PX = 24;
export const LAYOUT_MIN_TABLE_SIZE_PX = 32;

export function getCanvasSizePx(widthM: number, lengthM: number): { width: number; height: number } {
  return {
    width: Math.max(LAYOUT_MIN_CANVAS_WIDTH_PX, widthM * LAYOUT_PX_PER_M),
    height: Math.max(LAYOUT_MIN_CANVAS_HEIGHT_PX, lengthM * LAYOUT_PX_PER_M),
  };
}

export function getAreaSizePx(widthM: number, lengthM: number): { width: number; height: number } {
  return {
    width: Math.max(LAYOUT_MIN_AREA_WIDTH_PX, Math.round(widthM * LAYOUT_PX_PER_M)),
    height: Math.max(LAYOUT_MIN_AREA_HEIGHT_PX, Math.round(lengthM * LAYOUT_PX_PER_M)),
  };
}

export function getTableSizePx(
  table: FloorTable,
  tableTypes: TableType[],
): { width: number; height: number } {
  const type = tableTypes.find((t) => t.id === table.tableTypeId);
  return {
    width: Math.max(LAYOUT_MIN_TABLE_SIZE_PX, Math.round((type?.widthM ?? 1) * LAYOUT_PX_PER_M)),
    height: Math.max(LAYOUT_MIN_TABLE_SIZE_PX, Math.round((type?.lengthM ?? 1) * LAYOUT_PX_PER_M)),
  };
}

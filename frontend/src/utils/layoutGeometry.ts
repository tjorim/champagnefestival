import type { FloorArea, FloorTable, TableType } from "@/types/admin";
import { getAreaSizePx, getTableSizePx } from "@/utils/layoutUtils";

export function getTablesInArea(
  area: FloorArea,
  tables: FloorTable[],
  tableTypes: TableType[],
  canvasW: number,
  canvasH: number,
): FloorTable[] {
  const areaLeft = (area.x / 100) * canvasW;
  const areaTop = (area.y / 100) * canvasH;
  const { width: areaW, height: areaH } = getAreaSizePx(area.widthM, area.lengthM);

  const acx = areaLeft + areaW / 2;
  const acy = areaTop + areaH / 2;

  const rad = -((area.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return tables.filter((t) => {
    const { width: w, height: l } = getTableSizePx(t, tableTypes);
    const cx = (t.x / 100) * canvasW + w / 2;
    const cy = (t.y / 100) * canvasH + l / 2;

    const dx = cx - acx;
    const dy = cy - acy;
    const lx = cos * dx - sin * dy;
    const ly = sin * dx + cos * dy;

    return Math.abs(lx) <= areaW / 2 && Math.abs(ly) <= areaH / 2;
  });
}

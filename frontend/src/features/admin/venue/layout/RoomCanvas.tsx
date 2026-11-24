import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Grid3x3Icon, InfoIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { RestrictToElement } from "@dnd-kit/dom/modifiers";
import { m } from "@/paraglide/messages";
import type { Registration } from "@/types/registration";
import type { Room, FloorTable, FloorArea, TableType } from "@/api-types";
import {
  getAreaSizePx,
  getCanvasSizePx,
  getTableSizePx,
  safeRoomColor,
} from "@/lib/venue/layoutUtils";
import { getTablesInArea } from "../layoutGeometry";
import { type ItemRef } from "./layoutTypes";
import { DraggableTable } from "./DraggableTable";
import { DraggableArea } from "./DraggableArea";

// Sensor configuration — module-level so the descriptor is stable across renders.
const SENSORS = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })],
  }),
];

// ---------------------------------------------------------------------------
// RoomCanvas — the drag target for one room
// ---------------------------------------------------------------------------

interface RoomCanvasProps {
  fitPlan: boolean;
  room: Room;
  roomTables: FloorTable[];
  roomAreas: FloorArea[];
  tableTypes: TableType[];
  registrations: Registration[];
  organizations: ItemRef[];
  layer: "seating" | "areas";
  selectedTable: string | null;
  selectedArea: string | null;
  onSelectTable: (id: string | null) => void;
  onSelectArea: (id: string | null) => void;
  onMoveTable: (tableId: string, x: number, y: number) => void;
  onMoveArea: (areaId: string, x: number, y: number) => void;
}

export function RoomCanvas({
  fitPlan,
  room,
  roomTables,
  roomAreas,
  tableTypes,
  registrations,
  organizations,
  layer,
  selectedTable,
  selectedArea,
  onSelectTable,
  onSelectArea,
  onMoveTable,
  onMoveArea,
}: RoomCanvasProps) {
  const { width: canvasW, height: canvasH } = getCanvasSizePx(room.width_m, room.length_m);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      if (!viewport.clientWidth) return;
      setFitScale(
        Math.min(1, viewport.clientWidth / canvasW, (window.innerHeight * 0.55) / canvasH),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [canvasW, canvasH]);
  const scale = fitPlan ? fitScale : 1;

  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);

  // Callback-ref state keeps the modifier reactive to the mounted canvas node.
  const modifiers = useMemo(
    () => [RestrictToElement.configure({ element: () => canvasElement })],
    [canvasElement],
  );

  const handleDragEnd = useCallback(
    (
      event: Parameters<NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0],
    ) => {
      const { operation, canceled } = event;
      if (canceled || !operation.source) return;

      const { x: dx, y: dy } = operation.transform;
      const activeId = String(operation.source.id);

      if (activeId.startsWith("area_")) {
        const area = roomAreas.find((a) => a.id === activeId);
        if (!area) return;
        const { width: AREA_W, height: AREA_H } = getAreaSizePx(area.width_m, area.length_m);
        const leftPx = (area.x / 100) * canvasW + dx;
        const topPx = (area.y / 100) * canvasH + dy;
        const clampedX = Math.min(Math.max(0, leftPx), canvasW - AREA_W);
        const clampedY = Math.min(Math.max(0, topPx), canvasH - AREA_H);
        onMoveArea(area.id, (clampedX / canvasW) * 100, (clampedY / canvasH) * 100);
      } else {
        const table = roomTables.find((t) => t.id === activeId);
        if (!table) return;
        const { width: TABLE_W, height: TABLE_L } = getTableSizePx(table, tableTypes);
        const leftPx = (table.x / 100) * canvasW + dx;
        const topPx = (table.y / 100) * canvasH + dy;
        const clampedX = Math.min(Math.max(0, leftPx), canvasW - TABLE_W);
        const clampedY = Math.min(Math.max(0, topPx), canvasH - TABLE_L);
        onMoveTable(table.id, (clampedX / canvasW) * 100, (clampedY / canvasH) * 100);
      }
    },
    [roomAreas, roomTables, tableTypes, canvasW, canvasH, onMoveArea, onMoveTable],
  );

  const isEmpty = roomTables.length === 0 && roomAreas.length === 0;

  return (
    <div
      ref={viewportRef}
      className="overflow-auto pb-2"
      role="region"
      aria-label={room.name}
      tabIndex={0}
    >
      <p className="sr-only">{m.admin_layout_keyboard_hint()}</p>
      <DragDropProvider sensors={SENSORS} modifiers={modifiers} onDragEnd={handleDragEnd}>
        <div
          ref={setCanvasElement}
          onClick={() => {
            onSelectTable(null);
            onSelectArea(null);
          }}
          className="relative rounded-md border"

          /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
          style={{
            width: canvasW,
            height: canvasH,
            zoom: scale,
            borderColor: safeRoomColor(room.color),
            background:
              "repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(255,255,255,0.04) 27px,rgba(255,255,255,0.04) 28px)," +
              "repeating-linear-gradient(90deg,transparent,transparent 27px,rgba(255,255,255,0.04) 27px,rgba(255,255,255,0.04) 28px)",
            overflow: "visible",
            cursor: "default",
          }}
          /* oxlint-enable shadcn/no-inline-styles */
          aria-label={room.name}
        >
          {isEmpty && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-subtle text-center pointer-events-none">
              <Icon icon={Grid3x3Icon} className="text-5xl" />
              <AdminEmptyState>{m.admin_no_tables()}</AdminEmptyState>
            </div>
          )}
          {roomTables.map((table) => {
            const assigned = registrations
              .filter((r) => r.status !== "cancelled" && table.registration_ids.includes(r.id))
              .reduce(
                (sum, r) =>
                  sum + (r.allocations?.find((a) => a.table_id === table.id)?.guest_count ?? 0),
                0,
              );
            const isInSelectedArea = selectedArea
              ? (() => {
                  const area = roomAreas.find((a) => a.id === selectedArea);
                  if (!area) return false;
                  const [ts] = getTablesInArea(area, [table], tableTypes, canvasW, canvasH);
                  return ts !== undefined;
                })()
              : false;
            return (
              <DraggableTable
                key={table.id}
                table={table}
                tableTypes={tableTypes}
                assignedCount={assigned}
                exclusive={registrations.some(
                  (r) =>
                    r.status !== "cancelled" &&
                    r.allocations?.some((a) => a.table_id === table.id && a.exclusive),
                )}
                isSelected={selectedTable === table.id}
                isInteractive={layer === "seating"}
                canDrag={scale === 1}
                isInSelectedArea={isInSelectedArea}
                onClick={() => {
                  onSelectArea(null);
                  onSelectTable(selectedTable === table.id ? null : table.id);
                }}
                canvasW={canvasW}
                canvasH={canvasH}
              />
            );
          })}
          {roomAreas.map((area) => {
            const assignedLabel = area.organization_id
              ? (organizations.find((e) => e.id === area.organization_id)?.name ??
                m.admin_organization_fallback({ id: area.organization_id }))
              : null;
            return (
              <DraggableArea
                key={area.id}
                area={area}
                assignedLabel={assignedLabel}
                isSelected={selectedArea === area.id}
                isInteractive={layer === "areas"}
                canDrag={scale === 1}
                onClick={() => {
                  onSelectTable(null);
                  onSelectArea(selectedArea === area.id ? null : area.id);
                }}
                canvasW={canvasW}
                canvasH={canvasH}
              />
            );
          })}
        </div>
      </DragDropProvider>
      <p className="text-subtle text-sm mt-2">
        {m.admin_room_size({ width: room.width_m, length: room.length_m })}
        <span className="ms-2">
          <Icon icon={InfoIcon} className="me-1" />
          {scale === 1 ? m.admin_table_move_hint() : m.admin_layout_zoom_to_move()}
        </span>
      </p>
    </div>
  );
}

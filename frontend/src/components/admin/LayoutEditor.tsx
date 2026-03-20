/**
 * LayoutEditor — multi-room floor plan manager.
 *
 * Uses @dnd-kit/core for accessible, reliable drag-and-drop positioning
 * of tables within rooms.  Each room is rendered as a proportional canvas
 * (1 metre = PX_PER_M pixels).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Nav from "react-bootstrap/Nav";
import { m } from "@/paraglide/messages";
import type { Reservation } from "@/types/reservation";
import type { Room, FloorTable, FloorArea, TableType, Layout } from "@/types/admin";

// How many CSS pixels represent one metre on the canvas
const PX_PER_M = 28;

/**
 * Returns the tables whose centre point falls within the area's bounding rectangle,
 * accounting for the area's rotation by transforming table centres into the area's
 * local coordinate space before the containment check.
 */
function getTablesInArea(
  area: FloorArea,
  tables: FloorTable[],
  tableTypes: TableType[],
  canvasW: number,
  canvasH: number,
): FloorTable[] {
  const areaLeft = (area.x / 100) * canvasW;
  const areaTop = (area.y / 100) * canvasH;
  // Match DraggableArea's rendered dimensions (Math.round + minimums)
  const areaW = Math.max(40, Math.round(area.widthM * PX_PER_M));
  const areaH = Math.max(24, Math.round(area.lengthM * PX_PER_M));

  // Centre of the (unrotated) area bounding box
  const acx = areaLeft + areaW / 2;
  const acy = areaTop + areaH / 2;

  // Rotate points into the area's local space by applying -rotation
  const rad = -((area.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return tables.filter((t) => {
    const { w, l } = getTableSize(t, tableTypes);
    const cx = (t.x / 100) * canvasW + w / 2;
    const cy = (t.y / 100) * canvasH + l / 2;

    // Translate to area-centre-relative coordinates, then rotate
    const dx = cx - acx;
    const dy = cy - acy;
    const lx = cos * dx - sin * dy;
    const ly = sin * dx + cos * dy;

    return Math.abs(lx) <= areaW / 2 && Math.abs(ly) <= areaH / 2;
  });
}

// Preset icons available for floor areas — labels resolved at render time for i18n
function getAreaIcons(): { value: string; label: string }[] {
  return [
    { value: "bi-shop", label: m.admin_layout_area_icon_stand() },
    { value: "bi-glass-champagne", label: m.admin_layout_area_icon_champagne() },
    { value: "bi-music-note-beamed", label: m.admin_layout_area_icon_music() },
    { value: "bi-cup-hot", label: m.admin_layout_area_icon_catering() },
    { value: "bi-egg-fried", label: m.admin_layout_area_icon_food() },
    { value: "bi-gift", label: m.admin_layout_area_icon_gift() },
    { value: "bi-door-open", label: m.admin_layout_area_icon_entrance() },
    { value: "bi-info-circle", label: m.admin_layout_area_icon_info() },
    { value: "bi-camera", label: m.admin_layout_area_icon_photo() },
    { value: "bi-award", label: m.admin_layout_area_icon_award() },
    { value: "bi-people-fill", label: m.admin_layout_area_icon_meeting() },
    { value: "bi-tools", label: m.admin_layout_area_icon_technical() },
    { value: "bi-star", label: m.admin_layout_area_icon_feature() },
    { value: "bi-bar-chart-line", label: m.admin_layout_area_icon_exhibition() },
  ];
}
// Minimum canvas width so small rooms are still usable
const MIN_CANVAS_PX = 280;
function getTableSize(table: FloorTable, tableTypes: TableType[]): { w: number; l: number } {
  const type = tableTypes.find((t) => t.id === table.tableTypeId);
  return {
    w: Math.max(32, Math.round((type?.widthM ?? 1) * PX_PER_M)),
    l: Math.max(32, Math.round((type?.lengthM ?? 1) * PX_PER_M)),
  };
}

function getDayLabel(dayId: number): string {
  if (dayId === 1) return m.admin_content_edition_friday();
  if (dayId === 2) return m.admin_content_edition_saturday();
  return m.admin_content_edition_sunday();
}

interface ItemRef {
  id: number;
  name: string;
  active: boolean;
}

interface LayoutEditorProps {
  tables: FloorTable[];
  tableTypes: TableType[];
  layouts: Layout[];
  reservations: Reservation[];
  rooms: Room[];
  exhibitors: ItemRef[];
  areas: FloorArea[];
  onAddTable: (
    name: string,
    capacity: number,
    layoutId: string,
    tableTypeId: string,
  ) => Promise<void>;
  onMoveTable: (tableId: string, x: number, y: number) => void;
  onDeleteTable: (tableId: string) => Promise<void>;
  onRotateTable: (tableId: string, rotation: number) => void;
  onAddLayout: (roomId: string, dayId: number, label: string) => Promise<void>;
  onDeleteLayout: (layoutId: string) => Promise<void>;
  onAddArea: (
    label: string,
    icon: string,
    layoutId: string,
    widthM: number,
    lengthM: number,
    exhibitorId?: number,
  ) => Promise<void>;
  onMoveArea: (areaId: string, x: number, y: number) => void;
  onDeleteArea: (areaId: string) => Promise<void>;
  onRotateArea: (areaId: string, rotation: number) => void;
  onAssignAreaToItem: (
    areaId: string,
    exhibitorId: number | null,
    label?: string,
    icon?: string,
  ) => Promise<void>;
  onUpdateAreaLabel: (areaId: string, label: string) => void;
}

// ---------------------------------------------------------------------------
// DraggableTable
// ---------------------------------------------------------------------------

interface DraggableTableProps {
  table: FloorTable;
  tableTypes: TableType[];
  assignedCount: number;
  isSelected: boolean;
  isInteractive: boolean;
  isInSelectedArea: boolean;
  onClick: () => void;
  canvasW: number;
  canvasH: number;
}

function DraggableTable({
  table,
  tableTypes,
  assignedCount,
  isSelected,
  isInteractive,
  isInSelectedArea,
  onClick,
  canvasW,
  canvasH,
}: DraggableTableProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: table.id,
    disabled: !isInteractive,
  });

  const { w: TABLE_W, l: TABLE_L } = getTableSize(table, tableTypes);
  const type = tableTypes.find((t) => t.id === table.tableTypeId);
  const shape = type?.shape ?? "rectangle";

  // Convert percentage to pixel offset within the canvas
  const leftPx = (table.x / 100) * canvasW;
  const topPx = (table.y / 100) * canvasH;

  const isFull = table.capacity > 0 && assignedCount >= table.capacity;
  const borderCls = isSelected
    ? "border-warning"
    : isFull
      ? "border-danger"
      : assignedCount > 0
        ? "border-success"
        : "border-secondary";
  const bgCls = isSelected
    ? "bg-warning bg-opacity-25 text-warning"
    : isFull
      ? "bg-danger bg-opacity-10 text-danger"
      : assignedCount > 0
        ? "bg-success bg-opacity-10 text-success"
        : "bg-dark text-secondary";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isInteractive) return;
        e.stopPropagation();
        onClick();
      }}
      className={`position-absolute d-flex flex-column align-items-center justify-content-center border text-center ${shape === "round" ? "rounded-circle" : "rounded"} ${borderCls} ${bgCls}`}
      style={{
        left: leftPx,
        top: topPx,
        width: TABLE_W,
        height: TABLE_L,
        cursor: isDragging ? "grabbing" : isInteractive ? "grab" : "default",
        userSelect: "none",
        transform: `${CSS.Translate.toString(transform)} rotate(${table.rotation}deg)`,
        zIndex: isDragging ? 10 : 1,
        opacity: isInteractive ? (isDragging ? 0.8 : 1) : isInSelectedArea ? 0.7 : 0.25,
        transition: isDragging ? undefined : "border-color 0.15s, opacity 0.15s",
        pointerEvents: isInteractive ? undefined : "none",
      }}
      title={`${table.name} — ${assignedCount}/${table.capacity}`}
      role={isInteractive ? "button" : undefined}
      aria-pressed={isInteractive ? isSelected : undefined}
      aria-label={`${m.admin_table_label()} ${table.name}`}
    >
      <i className="bi bi-people-fill fs-5" aria-hidden="true" />
      <span className="small fw-semibold" style={{ fontSize: "0.7rem" }}>
        {table.name}
      </span>
      <span style={{ fontSize: "0.65rem" }}>
        {assignedCount}/{table.capacity}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DraggableArea
// ---------------------------------------------------------------------------

interface DraggableAreaProps {
  area: FloorArea;
  assignedLabel: string | null;
  isSelected: boolean;
  isInteractive: boolean;
  onClick: () => void;
  canvasW: number;
  canvasH: number;
}

function DraggableArea({
  area,
  assignedLabel,
  isSelected,
  isInteractive,
  onClick,
  canvasW,
  canvasH,
}: DraggableAreaProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: area.id,
    disabled: !isInteractive,
  });

  const AREA_W = Math.max(40, Math.round(area.widthM * PX_PER_M));
  const AREA_H = Math.max(24, Math.round(area.lengthM * PX_PER_M));

  const leftPx = (area.x / 100) * canvasW;
  const topPx = (area.y / 100) * canvasH;

  const borderCls = isSelected ? "border-warning" : "border-info";
  const bgCls = isSelected
    ? "bg-warning bg-opacity-25 text-warning"
    : "bg-info bg-opacity-10 text-info";
  const fadedStyle = !isInteractive ? { opacity: 0.25, pointerEvents: "none" as const } : {};

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isInteractive) return;
        e.stopPropagation();
        onClick();
      }}
      className={`position-absolute d-flex flex-column align-items-center justify-content-center border text-center rounded ${borderCls} ${bgCls}`}
      style={{
        left: leftPx,
        top: topPx,
        width: AREA_W,
        height: AREA_H,
        cursor: isDragging ? "grabbing" : isInteractive ? "grab" : "default",
        userSelect: "none",
        transform: `${CSS.Translate.toString(transform)} rotate(${area.rotation}deg)`,
        zIndex: isDragging ? 10 : 2,
        opacity: isDragging ? 0.8 : 1,
        transition: isDragging ? undefined : "border-color 0.15s",
        ...fadedStyle,
      }}
      title={area.label}
      role={isInteractive ? "button" : undefined}
      aria-pressed={isInteractive ? isSelected : undefined}
      aria-label={`Area: ${area.label}`}
    >
      <i
        className={`bi ${area.icon || "bi-shop"}`}
        style={{ fontSize: "0.8rem" }}
        aria-hidden="true"
      />
      <span
        className="fw-semibold text-truncate w-100 text-center px-1"
        style={{ fontSize: "0.65rem" }}
      >
        {area.label}
      </span>
      {assignedLabel && (
        <span
          className="text-truncate w-100 text-center px-1"
          style={{ fontSize: "0.55rem", opacity: 0.85 }}
          title={assignedLabel}
        >
          {assignedLabel}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoomCanvas — the drag target for one room
// ---------------------------------------------------------------------------

interface RoomCanvasProps {
  room: Room;
  roomTables: FloorTable[];
  roomAreas: FloorArea[];
  tableTypes: TableType[];
  reservations: Reservation[];
  exhibitors: ItemRef[];
  layer: "seating" | "areas";
  selectedTable: string | null;
  selectedArea: string | null;
  onSelectTable: (id: string | null) => void;
  onSelectArea: (id: string | null) => void;
  onMoveTable: (tableId: string, x: number, y: number) => void;
  onMoveArea: (areaId: string, x: number, y: number) => void;
}

function RoomCanvas({
  room,
  roomTables,
  roomAreas,
  tableTypes,
  reservations,
  exhibitors,
  layer,
  selectedTable,
  selectedArea,
  onSelectTable,
  onSelectArea,
  onMoveTable,
  onMoveArea,
}: RoomCanvasProps) {
  const canvasW = Math.max(MIN_CANVAS_PX, room.widthM * PX_PER_M);
  const canvasH = Math.max(180, room.lengthM * PX_PER_M);

  const canvasRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      if (!canvasRef.current) return;

      const activeId = active.id as string;

      if (activeId.startsWith("area_")) {
        // Area drag
        const area = roomAreas.find((a) => a.id === activeId);
        if (!area) return;
        const AREA_W = Math.max(40, Math.round(area.widthM * PX_PER_M));
        const AREA_H = Math.max(24, Math.round(area.lengthM * PX_PER_M));
        const leftPx = (area.x / 100) * canvasW + delta.x;
        const topPx = (area.y / 100) * canvasH + delta.y;
        const clampedX = Math.min(Math.max(0, leftPx), canvasW - AREA_W);
        const clampedY = Math.min(Math.max(0, topPx), canvasH - AREA_H);
        onMoveArea(area.id, (clampedX / canvasW) * 100, (clampedY / canvasH) * 100);
      } else {
        // Table drag
        const table = roomTables.find((t) => t.id === activeId);
        if (!table) return;
        const { w: TABLE_W, l: TABLE_L } = getTableSize(table, tableTypes);
        const leftPx = (table.x / 100) * canvasW + delta.x;
        const topPx = (table.y / 100) * canvasH + delta.y;
        const clampedX = Math.min(Math.max(0, leftPx), canvasW - TABLE_W);
        const clampedY = Math.min(Math.max(0, topPx), canvasH - TABLE_L);
        onMoveTable(table.id, (clampedX / canvasW) * 100, (clampedY / canvasH) * 100);
      }
    },
    [roomTables, roomAreas, tableTypes, canvasW, canvasH, onMoveTable, onMoveArea],
  );

  const isEmpty = roomTables.length === 0 && roomAreas.length === 0;

  return (
    <div className="overflow-auto pb-2">
      <p className="text-secondary small mb-1">
        {room.widthM} m × {room.lengthM} m
        <span className="ms-2">
          <i className="bi bi-info-circle me-1" aria-hidden="true" />
          {m.admin_table_move_hint()}
        </span>
      </p>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          ref={canvasRef}
          onClick={() => {
            onSelectTable(null);
            onSelectArea(null);
          }}
          className="position-relative border rounded"
          style={{
            width: canvasW,
            height: canvasH,
            borderColor: room.color,
            background:
              "repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(255,255,255,0.04) 27px,rgba(255,255,255,0.04) 28px)," +
              "repeating-linear-gradient(90deg,transparent,transparent 27px,rgba(255,255,255,0.04) 27px,rgba(255,255,255,0.04) 28px)",
            overflow: "hidden",
            cursor: "default",
          }}
          aria-label={room.name}
        >
          {isEmpty && (
            <div
              className="position-absolute top-50 start-50 translate-middle text-secondary text-center"
              style={{ pointerEvents: "none" }}
            >
              <i className="bi bi-grid-3x3-gap display-4" aria-hidden="true" />
              <p className="mt-2 small">{m.admin_no_tables()}</p>
            </div>
          )}
          {roomTables.map((table) => {
            const assigned = reservations.filter((r) => table.reservationIds.includes(r.id)).length;
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
                isSelected={selectedTable === table.id}
                isInteractive={layer === "seating"}
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
            const assignedLabel = area.exhibitorId
              ? (exhibitors.find((e) => e.id === area.exhibitorId)?.name ??
                `Exhibitor #${area.exhibitorId}`)
              : null;
            return (
              <DraggableArea
                key={area.id}
                area={area}
                assignedLabel={assignedLabel}
                isSelected={selectedArea === area.id}
                isInteractive={layer === "areas"}
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
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayoutEditor (main export)
// ---------------------------------------------------------------------------

export default function LayoutEditor({
  tables,
  tableTypes,
  layouts,
  reservations,
  rooms,
  exhibitors,
  areas,
  onAddTable,
  onMoveTable,
  onDeleteTable,
  onRotateTable,
  onAddLayout,
  onDeleteLayout,
  onAddArea,
  onMoveArea,
  onDeleteArea,
  onRotateArea,
  onAssignAreaToItem,
  onUpdateAreaLabel,
}: LayoutEditorProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [layer, setLayer] = useState<"seating" | "areas">("seating");

  // Auto-select first room
  useEffect(() => {
    if (!activeRoomId && rooms.length > 0) {
      setActiveRoomId(rooms[0]?.id ?? null);
    }
  }, [rooms, activeRoomId]);

  // Auto-select first layout when active room changes
  useEffect(() => {
    if (activeRoomId) {
      const roomLayouts = layouts.filter((l) => l.roomId === activeRoomId);
      if (roomLayouts.length === 0) {
        setActiveLayoutId(null);
      } else if (!roomLayouts.find((l) => l.id === activeLayoutId)) {
        setActiveLayoutId(roomLayouts[0]?.id ?? null);
      }
    }
  }, [activeRoomId, layouts, activeLayoutId]);

  // Add Layout modal
  const [showAddLayout, setShowAddLayout] = useState(false);
  const [newLayout, setNewLayout] = useState({ dayId: 1, label: "" });
  const [addLayoutError, setAddLayoutError] = useState<string | null>(null);
  const [deleteLayoutError, setDeleteLayoutError] = useState<string | null>(null);

  const handleAddLayout = useCallback(async () => {
    if (!activeRoomId) return;
    setAddLayoutError(null);
    try {
      await onAddLayout(activeRoomId, newLayout.dayId, newLayout.label.trim());
      setNewLayout({ dayId: 1, label: "" });
      setShowAddLayout(false);
    } catch (err) {
      console.error("Failed to add layout", err);
      setAddLayoutError(err instanceof Error ? err.message : m.admin_error_add_layout());
    }
  }, [activeRoomId, newLayout, onAddLayout]);

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      if (!window.confirm(m.admin_layout_delete_confirm())) return;
      setDeleteLayoutError(null);
      try {
        await onDeleteLayout(layoutId);
        if (activeLayoutId === layoutId) {
          setActiveLayoutId(null);
          setSelectedTable(null);
          setSelectedArea(null);
        }
      } catch (err) {
        console.error("Failed to delete layout", err);
        setDeleteLayoutError(err instanceof Error ? err.message : m.admin_error_delete_layout());
      }
    },
    [onDeleteLayout, activeLayoutId],
  );

  // Add Table modal
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTable, setNewTable] = useState({
    name: "",
    capacity: 4,
    tableTypeId: "",
  });
  const [addTableError, setAddTableError] = useState<string | null>(null);

  const [deleteTableError, setDeleteTableError] = useState<string | null>(null);
  // Add Area modal
  const [showAddArea, setShowAddArea] = useState(false);
  const [newArea, setNewArea] = useState({
    label: "",
    icon: "bi-shop",
    widthM: 1.5,
    lengthM: 1.0,
    assignedType: "" as "" | "e",
    assignedId: 0,
  });
  const [addAreaError, setAddAreaError] = useState<string | null>(null);
  const [deleteAreaError, setDeleteAreaError] = useState<string | null>(null);
  const [assignAreaError, setAssignAreaError] = useState<string | null>(null);

  const handleAddTable = useCallback(async () => {
    if (!newTable.name.trim() || newTable.capacity < 1 || !newTable.tableTypeId || !activeLayoutId)
      return;
    setAddTableError(null);
    try {
      await onAddTable(
        newTable.name.trim(),
        newTable.capacity,
        activeLayoutId,
        newTable.tableTypeId,
      );
      setNewTable({ name: "", capacity: 4, tableTypeId: "" });
      setShowAddTable(false);
    } catch (err) {
      console.error("Failed to add table", err);
      setAddTableError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [newTable, onAddTable, activeLayoutId]);

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      setDeleteTableError(null);
      try {
        await onDeleteTable(tableId);
        setSelectedTable(null);
      } catch (err) {
        console.error("Failed to delete table", err);
        setDeleteTableError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [onDeleteTable],
  );

  const handleAddArea = useCallback(async () => {
    if (!newArea.label.trim() || !activeLayoutId) return;
    setAddAreaError(null);
    try {
      const exhibitorId = newArea.assignedType === "e" ? newArea.assignedId : undefined;
      await onAddArea(
        newArea.label.trim(),
        newArea.icon || "bi-shop",
        activeLayoutId,
        newArea.widthM,
        newArea.lengthM,
        exhibitorId,
      );
      setNewArea({
        label: "",
        icon: "bi-shop",
        widthM: 1.5,
        lengthM: 1.0,
        assignedType: "",
        assignedId: 0,
      });
      setShowAddArea(false);
    } catch (err) {
      console.error("Failed to add area", err);
      setAddAreaError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [newArea, onAddArea, activeLayoutId]);

  const handleDeleteArea = useCallback(
    async (areaId: string) => {
      setDeleteAreaError(null);
      try {
        await onDeleteArea(areaId);
        setSelectedArea(null);
      } catch (err) {
        console.error("Failed to delete area", err);
        setDeleteAreaError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [onDeleteArea],
  );

  const selectedTableData = tables.find((t) => t.id === selectedTable);
  const selectedType = tableTypes.find((t) => t.id === selectedTableData?.tableTypeId);
  const selectedReservations = selectedTableData
    ? reservations.filter((r) => selectedTableData.reservationIds.includes(r.id))
    : [];

  const activeLayout = layouts.find((l) => l.id === activeLayoutId);
  const activeRoom = rooms.find((r) => r.id === (activeLayout?.roomId ?? activeRoomId));
  const roomLayouts = layouts
    .filter((l) => l.roomId === activeRoomId)
    .sort((a, b) => a.dayId - b.dayId);
  const canvasTables = activeLayoutId ? tables.filter((t) => t.layoutId === activeLayoutId) : [];
  const canvasAreas = activeLayoutId ? areas.filter((a) => a.layoutId === activeLayoutId) : [];

  const selectedAreaData = canvasAreas.find((a) => a.id === selectedArea);

  const areaCanvasW = activeRoom ? Math.max(MIN_CANVAS_PX, activeRoom.widthM * PX_PER_M) : 0;
  const areaCanvasH = activeRoom ? Math.max(180, activeRoom.lengthM * PX_PER_M) : 0;
  const tablesInSelectedArea = selectedAreaData
    ? getTablesInArea(selectedAreaData, canvasTables, tableTypes, areaCanvasW, areaCanvasH)
    : [];

  const handleSelectRoom = useCallback((k: string | null) => {
    if (k) {
      setActiveRoomId(k);
      setSelectedTable(null);
      setSelectedArea(null);
    }
  }, []);

  return (
    <div>
      {/* Tab bar: one tab per room */}
      <Card bg="dark" text="white" border="secondary" className="mb-3">
        <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <Nav
            variant="pills"
            activeKey={activeRoomId ?? ""}
            onSelect={handleSelectRoom}
            className="flex-wrap"
          >
            {rooms.map((room) => {
              const roomTableCount = layouts
                .filter((l) => l.roomId === room.id)
                .reduce((sum, l) => sum + tables.filter((t) => t.layoutId === l.id).length, 0);
              return (
                <Nav.Item key={room.id}>
                  <Nav.Link eventKey={room.id} className="py-1 px-2 small text-light">
                    <span
                      className="me-1 rounded-circle d-inline-block"
                      style={{
                        width: 10,
                        height: 10,
                        background: room.color,
                        verticalAlign: "middle",
                      }}
                      aria-hidden="true"
                    />
                    {room.name}
                    <Badge bg="secondary" className="ms-1" style={{ fontSize: "0.6rem" }}>
                      {roomTableCount}
                    </Badge>
                  </Nav.Link>
                </Nav.Item>
              );
            })}
          </Nav>
          <div className="d-flex gap-2 align-items-center">
            <div className="btn-group btn-group-sm" role="group" aria-label="Layer">
              <Button
                variant={layer === "seating" ? "warning" : "outline-secondary"}
                size="sm"
                onClick={() => {
                  setLayer("seating");
                  setSelectedArea(null);
                }}
              >
                <i className="bi bi-people-fill me-1" aria-hidden="true" />
                {m.admin_layout_seating()}
              </Button>
              <Button
                variant={layer === "areas" ? "info" : "outline-secondary"}
                size="sm"
                onClick={() => {
                  setLayer("areas");
                  setSelectedTable(null);
                }}
              >
                <i className="bi bi-shop me-1" aria-hidden="true" />
                {m.admin_layout_areas()}
              </Button>
            </div>
            {layer === "seating" ? (
              <Button
                variant="outline-warning"
                size="sm"
                onClick={() => {
                  setAddTableError(null);
                  setShowAddTable(true);
                }}
                disabled={!activeLayoutId}
              >
                <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                {m.admin_add_table()}
              </Button>
            ) : (
              <Button
                variant="outline-info"
                size="sm"
                onClick={() => {
                  setAddAreaError(null);
                  setNewArea({
                    label: "",
                    icon: "bi-shop",
                    widthM: 1.5,
                    lengthM: 1.0,
                    assignedType: "",
                    assignedId: 0,
                  });
                  setShowAddArea(true);
                }}
                disabled={!activeLayoutId}
              >
                <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                {m.admin_layout_add_area()}
              </Button>
            )}
          </div>
        </Card.Header>

        <Card.Body className="p-2">
          {rooms.length === 0 ? (
            <p className="text-secondary text-center small mb-0">
              <i className="bi bi-info-circle me-1" aria-hidden="true" />
              {m.admin_room_no_rooms()}
            </p>
          ) : activeRoom ? (
            <div>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-semibold" style={{ color: activeRoom.color }}>
                    <i className="bi bi-building me-1" aria-hidden="true" />
                    {activeRoom.name}
                  </span>
                  {/* Day / layout selector */}
                  <div className="d-flex flex-wrap gap-1 align-items-center">
                    {roomLayouts.map((layout) => (
                      <div key={layout.id} className="d-flex align-items-center gap-0">
                        <Button
                          size="sm"
                          variant={activeLayoutId === layout.id ? "warning" : "outline-secondary"}
                          onClick={() => {
                            setActiveLayoutId(layout.id);
                            setSelectedTable(null);
                          }}
                          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                        >
                          {layout.label || getDayLabel(layout.dayId)}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleDeleteLayout(layout.id)}
                          title={m.admin_delete()}
                          aria-label={m.admin_delete()}
                          style={{
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                            borderLeft: "none",
                          }}
                        >
                          <i className="bi bi-x" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    {roomLayouts.length === 0 && (
                      <span className="text-secondary small">{m.admin_no_layouts()}</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline-success"
                      onClick={() => {
                        setAddLayoutError(null);
                        setNewLayout({ dayId: 1, label: "" });
                        setShowAddLayout(true);
                      }}
                      title={m.admin_add_layout()}
                    >
                      <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                      {m.admin_add_layout()}
                    </Button>
                  </div>
                </div>
              </div>
              {deleteLayoutError && (
                <Alert variant="danger" className="py-1 mb-2 small">
                  {deleteLayoutError}
                </Alert>
              )}
              {activeLayoutId ? (
                <RoomCanvas
                  room={activeRoom}
                  roomTables={canvasTables}
                  roomAreas={canvasAreas}
                  tableTypes={tableTypes}
                  reservations={reservations}
                  exhibitors={exhibitors}
                  layer={layer}
                  selectedTable={selectedTable}
                  selectedArea={selectedArea}
                  onSelectTable={setSelectedTable}
                  onSelectArea={setSelectedArea}
                  onMoveTable={onMoveTable}
                  onMoveArea={onMoveArea}
                />
              ) : (
                <p className="text-secondary text-center small py-4 mb-0">{m.admin_no_layouts()}</p>
              )}
            </div>
          ) : null}
        </Card.Body>
      </Card>

      {/* Selected table detail */}
      {selectedTableData && (
        <Card bg="dark" text="white" border="warning" className="mb-3">
          <Card.Header className="d-flex align-items-center justify-content-between border-warning">
            <span className="fw-semibold">
              <i className="bi bi-table me-2" aria-hidden="true" />
              {m.admin_table_label()}: {selectedTableData.name}
            </span>
            <div className="d-flex gap-2 align-items-center">
              <Badge bg="secondary">
                {selectedTableData.capacity} {m.admin_guests_count()}
              </Badge>
              {selectedType && (
                <Badge bg="secondary" className="text-light">
                  {selectedType.name}
                </Badge>
              )}
              {selectedType && (
                <Badge
                  bg={selectedType.heightType === "high" ? "info" : "dark"}
                  text={selectedType.heightType === "high" ? "dark" : "secondary"}
                  className="border border-secondary"
                >
                  {selectedType.heightType === "high"
                    ? m.admin_table_height_type_high()
                    : m.admin_table_height_type_low()}
                </Badge>
              )}
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => onRotateTable(selectedTableData.id, selectedTableData.rotation - 15)}
                title={m.admin_layout_rotate_ccw()}
                aria-label={m.admin_layout_rotate_ccw()}
              >
                <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
              </Button>
              <span
                className="text-secondary small"
                style={{ minWidth: "3.5rem", textAlign: "center" }}
              >
                {Math.round(selectedTableData.rotation)}°
              </span>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => onRotateTable(selectedTableData.id, selectedTableData.rotation + 15)}
                title={m.admin_layout_rotate_cw()}
                aria-label={m.admin_layout_rotate_cw()}
              >
                <i className="bi bi-arrow-clockwise" aria-hidden="true" />
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => handleDeleteTable(selectedTableData.id)}
                title={m.admin_delete()}
                aria-label={m.admin_delete()}
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            {deleteTableError && (
              <Alert variant="danger" className="py-1 mb-2 small">
                {deleteTableError}
              </Alert>
            )}
            {selectedReservations.length === 0 ? (
              <p className="text-secondary mb-0">{m.admin_unassigned()}</p>
            ) : (
              <ListGroup variant="flush">
                {selectedReservations.map((r) => (
                  <ListGroup.Item key={r.id} className="bg-dark text-light border-secondary">
                    <span className="fw-semibold">{r.person.name}</span>
                    <span className="text-secondary ms-2 small">
                      ({r.guestCount} {m.admin_guests_count()})
                    </span>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Selected area detail */}
      {selectedAreaData && (
        <Card bg="dark" text="white" border="info" className="mb-3">
          <Card.Header className="d-flex align-items-center justify-content-between border-info">
            <span className="fw-semibold">
              <i className={`bi ${selectedAreaData.icon || "bi-shop"} me-2`} aria-hidden="true" />
              {m.admin_layout_area_label_prefix()} {selectedAreaData.label}
            </span>
            <div className="d-flex gap-2 align-items-center">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => onRotateArea(selectedAreaData.id, selectedAreaData.rotation - 15)}
                title={m.admin_layout_rotate_ccw()}
                aria-label={m.admin_layout_rotate_ccw()}
              >
                <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
              </Button>
              <span
                className="text-secondary small"
                style={{ minWidth: "3.5rem", textAlign: "center" }}
              >
                {Math.round(selectedAreaData.rotation)}°
              </span>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => onRotateArea(selectedAreaData.id, selectedAreaData.rotation + 15)}
                title={m.admin_layout_rotate_cw()}
                aria-label={m.admin_layout_rotate_cw()}
              >
                <i className="bi bi-arrow-clockwise" aria-hidden="true" />
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => handleDeleteArea(selectedAreaData.id)}
                title={m.admin_delete()}
                aria-label={m.admin_delete()}
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            {deleteAreaError && (
              <Alert variant="danger" className="py-1 mb-2 small">
                {deleteAreaError}
              </Alert>
            )}
            {assignAreaError && (
              <Alert
                variant="danger"
                className="py-1 mb-2 small"
                dismissible
                onClose={() => setAssignAreaError(null)}
              >
                {assignAreaError}
              </Alert>
            )}
            <Form.Group className="mb-3" controlId="area-label">
              <Form.Label className="text-secondary small">
                {m.admin_layout_area_form_label()}
              </Form.Label>
              <Form.Control
                size="sm"
                type="text"
                className="bg-dark text-light border-secondary"
                defaultValue={selectedAreaData.label}
                onBlur={(e) => {
                  const newLabel = e.target.value.trim();
                  if (newLabel && newLabel !== selectedAreaData.label) {
                    onUpdateAreaLabel(selectedAreaData.id, newLabel);
                  }
                }}
                key={selectedAreaData.id}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="area-icon">
              <Form.Label className="text-secondary small">
                {m.admin_layout_area_form_icon()}
              </Form.Label>
              <div className="d-flex gap-2 align-items-center">
                <i
                  className={`bi ${selectedAreaData.icon || "bi-shop"} text-info`}
                  aria-hidden="true"
                />
                <Form.Select
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={selectedAreaData.icon || "bi-shop"}
                  onChange={async (e) => {
                    const newIcon = e.target.value;
                    setAssignAreaError(null);
                    try {
                      await onAssignAreaToItem(
                        selectedAreaData.id,
                        selectedAreaData.exhibitorId,
                        undefined,
                        newIcon,
                      );
                    } catch (err) {
                      setAssignAreaError(
                        err instanceof Error ? err.message : "Failed to update icon.",
                      );
                    }
                  }}
                  key={`icon-${selectedAreaData.id}`}
                >
                  {getAreaIcons().map((ic) => (
                    <option key={ic.value} value={ic.value}>
                      {ic.label}
                    </option>
                  ))}
                </Form.Select>
              </div>
            </Form.Group>
            <Form.Group controlId="area-assign-item">
              <Form.Label className="text-secondary small">
                {m.admin_layout_area_assigned_to()}
              </Form.Label>
              <Form.Select
                size="sm"
                className="bg-dark text-light border-secondary"
                value={selectedAreaData.exhibitorId ? `e:${selectedAreaData.exhibitorId}` : ""}
                onChange={async (ev) => {
                  const val = ev.target.value;
                  setAssignAreaError(null);
                  try {
                    let eId: number | null = null;
                    let newLabel: string | undefined;
                    if (val.startsWith("e:")) {
                      eId = Number(val.slice(2));
                      newLabel = exhibitors.find((e) => e.id === eId)?.name;
                    }
                    await onAssignAreaToItem(selectedAreaData.id, eId, newLabel);
                  } catch (err) {
                    setAssignAreaError(
                      err instanceof Error ? err.message : "Failed to assign area.",
                    );
                  }
                }}
              >
                <option value="">{m.admin_layout_area_none()}</option>
                {exhibitors.filter((e) => e.active).length > 0 && (
                  <optgroup label={m.admin_layout_area_exhibitors_group()}>
                    {exhibitors
                      .filter((e) => e.active)
                      .map((e) => (
                        <option key={e.id} value={`e:${e.id}`}>
                          {e.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </Form.Select>
            </Form.Group>
            {tablesInSelectedArea.length > 0 && (
              <div className="mt-3 pt-3 border-top border-secondary">
                <p className="text-secondary small mb-2">
                  <i className="bi bi-grid-3x3-gap me-1" aria-hidden="true" />
                  {m.admin_layout_tables_in_stand()}{" "}
                  <Badge bg="info" text="dark">
                    {tablesInSelectedArea.length}
                  </Badge>
                  <span className="ms-2 text-secondary">
                    {tablesInSelectedArea.reduce((s, t) => s + t.capacity, 0)}{" "}
                    {m.admin_layout_places_total()}
                  </span>
                </p>
                <ListGroup variant="flush">
                  {tablesInSelectedArea.map((t) => (
                    <ListGroup.Item
                      key={t.id}
                      className="bg-dark text-light border-secondary py-1 px-2 small"
                    >
                      <i className="bi bi-grid-3x3 me-1 text-secondary" aria-hidden="true" />
                      {t.name}
                      <Badge bg="secondary" className="ms-2" style={{ fontSize: "0.65rem" }}>
                        {t.capacity} {m.admin_layout_capacity_abbrev()}
                      </Badge>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </div>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Add Layout Modal */}
      <Modal
        show={showAddLayout}
        onHide={() => setShowAddLayout(false)}
        centered
        aria-labelledby="add-layout-modal-title"
      >
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="add-layout-modal-title">{m.admin_add_layout()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addLayoutError && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {addLayoutError}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="layout-day">
            <Form.Label>{m.admin_layout_day_label()}</Form.Label>
            <Form.Select
              value={newLayout.dayId}
              onChange={(e) => setNewLayout((p) => ({ ...p, dayId: Number(e.target.value) }))}
              className="bg-dark text-light border-secondary"
            >
              <option value={1}>{m.admin_content_edition_friday()}</option>
              <option value={2}>{m.admin_content_edition_saturday()}</option>
              <option value={3}>{m.admin_content_edition_sunday()}</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="layout-label">
            <Form.Label>
              {m.admin_table_name()} / {m.admin_layout_day_label()}
            </Form.Label>
            <Form.Control
              type="text"
              value={newLayout.label}
              onChange={(e) => setNewLayout((p) => ({ ...p, label: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder={m.admin_layout_label_placeholder()}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowAddLayout(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="success" onClick={handleAddLayout}>
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add Area Modal */}
      <Modal
        show={showAddArea}
        onHide={() => setShowAddArea(false)}
        centered
        aria-labelledby="add-area-modal-title"
      >
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="add-area-modal-title">{m.admin_layout_add_area()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addAreaError && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {addAreaError}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="area-new-label">
            <Form.Label>{m.admin_layout_area_form_label()}</Form.Label>
            <Form.Control
              type="text"
              value={newArea.label}
              onChange={(e) => setNewArea((p) => ({ ...p, label: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder={m.admin_layout_area_label_placeholder()}
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="area-new-icon">
            <Form.Label>{m.admin_layout_area_form_icon()}</Form.Label>
            <div className="d-flex gap-2 align-items-center">
              <i className={`bi ${newArea.icon} fs-4 text-info`} aria-hidden="true" />
              <Form.Select
                value={newArea.icon}
                onChange={(e) => setNewArea((p) => ({ ...p, icon: e.target.value }))}
                className="bg-dark text-light border-secondary"
              >
                {getAreaIcons().map((ic) => (
                  <option key={ic.value} value={ic.value}>
                    {ic.label}
                  </option>
                ))}
              </Form.Select>
            </div>
          </Form.Group>
          <Form.Group className="mb-3" controlId="area-new-assign">
            <Form.Label>{m.admin_layout_area_assigned_to_optional()}</Form.Label>
            <Form.Select
              value={newArea.assignedType ? `${newArea.assignedType}:${newArea.assignedId}` : ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setNewArea((p) => ({ ...p, assignedType: "", assignedId: 0 }));
                } else {
                  const [t, id] = val.split(":");
                  const entityName = exhibitors.find((x) => x.id === Number(id))?.name;
                  setNewArea((p) => ({
                    ...p,
                    assignedType: t as "e",
                    assignedId: Number(id),
                    label: p.label || (entityName ?? p.label),
                  }));
                }
              }}
              className="bg-dark text-light border-secondary"
            >
              <option value="">{m.admin_layout_area_none()}</option>
              {exhibitors.filter((e) => e.active).length > 0 && (
                <optgroup label={m.admin_layout_area_exhibitors_group()}>
                  {exhibitors
                    .filter((e) => e.active)
                    .map((e) => (
                      <option key={e.id} value={`e:${e.id}`}>
                        {e.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </Form.Select>
          </Form.Group>
          <div className="row g-3">
            <div className="col">
              <Form.Group controlId="area-new-width">
                <Form.Label>{m.admin_layout_area_width_m()}</Form.Label>
                <Form.Control
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.5}
                  value={newArea.widthM}
                  onChange={(e) => setNewArea((p) => ({ ...p, widthM: Number(e.target.value) }))}
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
            </div>
            <div className="col">
              <Form.Group controlId="area-new-length">
                <Form.Label>{m.admin_layout_area_length_m()}</Form.Label>
                <Form.Control
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.5}
                  value={newArea.lengthM}
                  onChange={(e) => setNewArea((p) => ({ ...p, lengthM: Number(e.target.value) }))}
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowAddArea(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="info" onClick={handleAddArea} disabled={!newArea.label.trim()}>
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add Table Modal */}
      <Modal
        show={showAddTable}
        onHide={() => setShowAddTable(false)}
        centered
        aria-labelledby="add-table-modal-title"
      >
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="add-table-modal-title">{m.admin_add_table()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addTableError && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {addTableError}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="table-name">
            <Form.Label>{m.admin_table_name()}</Form.Label>
            <Form.Control
              type="text"
              value={newTable.name}
              onChange={(e) => setNewTable((p) => ({ ...p, name: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder={m.admin_table_name_placeholder()}
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="table-type">
            <Form.Label>{m.admin_table_type_select()}</Form.Label>
            <Form.Select
              value={newTable.tableTypeId}
              onChange={(e) => {
                const tt = tableTypes.find((t) => t.id === e.target.value);
                setNewTable((p) => ({
                  ...p,
                  tableTypeId: e.target.value,
                  capacity: tt ? Math.min(p.capacity, tt.maxCapacity) : p.capacity,
                }));
              }}
              className="bg-dark text-light border-secondary"
            >
              <option value="">— {m.admin_table_type_select()} —</option>
              {tableTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name} (
                  {tt.shape === "round" ? `⌀${tt.widthM}m` : `${tt.widthM}×${tt.lengthM}m`},{" "}
                  {tt.heightType === "high"
                    ? m.admin_table_height_type_high()
                    : m.admin_table_height_type_low()}
                  , {m.admin_layout_capacity_max()} {tt.maxCapacity})
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="table-capacity">
            <Form.Label>{m.admin_table_capacity()}</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={50}
              value={newTable.capacity}
              onChange={(e) => setNewTable((p) => ({ ...p, capacity: Number(e.target.value) }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowAddTable(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="warning"
            onClick={handleAddTable}
            disabled={!newTable.name.trim() || newTable.capacity < 1 || !newTable.tableTypeId}
          >
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

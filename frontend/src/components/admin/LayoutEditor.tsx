import { AreaIcon } from "@/components/AreaIcon";
import {
  ArrowLeftRightIcon,
  BuildingIcon,
  CalendarIcon,
  Grid3X3Icon,
  HistoryIcon,
  InfoIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  StoreIcon,
  TableIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
/**
 * LayoutEditor — multi-room floor plan manager.
 *
 * Uses @dnd-kit/react for accessible, reliable drag-and-drop positioning
 * of tables within rooms.  Each room is rendered as a proportional canvas
 * (1 metre = PX_PER_M pixels).
 */

import clsx from "clsx";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { DragDropProvider, PointerSensor, useDraggable } from "@dnd-kit/react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { RestrictToElement } from "@dnd-kit/dom/modifiers";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button as RoomButton } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import type { Registration } from "@/types/registration";
import type { TableAllocation } from "@/types/registration";
import type { Room, FloorTable, FloorArea, TableType, Layout, LayoutRevision } from "@/types/admin";
import { getAreaSizePx, getCanvasSizePx, getTableSizePx } from "@/utils/layoutUtils";
import { getTablesInArea } from "@/utils/layoutGeometry";
import { devError } from "@/utils/devLog";
import LayoutCompareModal from "./LayoutCompareModal";
import LayoutRevisionsModal from "./LayoutRevisionsModal";
import ConfirmModal from "@/components/ConfirmModal";

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
// Sensor configuration — module-level so the descriptor is stable across renders.
const SENSORS = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })],
  }),
];

export interface DayOption {
  eventId: string;
  date: string;
  label: string;
}

function getInitialNewLayoutState(dayOptions: DayOption[]) {
  return {
    eventId: dayOptions[0]?.eventId ?? "",
    copyFromLayoutId: "",
    copyTables: true,
    copyAreas: true,
  };
}

export function getDayLabel(
  layout: { eventId: string | null; eventTitle?: string; date?: string | null; label?: string },
  dayOptions: DayOption[],
): string {
  const { eventId, eventTitle, date, label = "" } = layout;
  if (eventId) {
    const fromDayOptions = dayOptions.find((day) => day.eventId === eventId)?.label;
    if (fromDayOptions) return fromDayOptions;
  }
  // The event isn't in the active edition's day options — most likely a
  // layout from a different edition (e.g. "last year's breakfast" in the
  // cross-date compare picker). Fall back to the layout's own event title
  // rather than showing blank.
  if (eventTitle) {
    const formattedDate = date ? new Date(`${date}T00:00:00`).toLocaleDateString() : "";
    return formattedDate ? `${eventTitle} — ${formattedDate}` : eventTitle;
  }
  return label;
}

interface ItemRef {
  id: number;
  name: string;
  active: boolean;
}

interface LayoutEditorProps {
  dayOptions: DayOption[];
  tables: FloorTable[];
  tableTypes: TableType[];
  layouts: Layout[];
  registrations: Registration[];
  rooms: Room[];
  exhibitors: ItemRef[];
  areas: FloorArea[];
  onAddTable: (name: string, layoutId: string, tableTypeId: string) => Promise<void>;
  onMoveTable: (tableId: string, x: number, y: number) => void;
  onDeleteTable: (tableId: string) => Promise<void>;
  onRotateTable: (tableId: string, rotation: number) => void;
  onAddLayout: (
    roomId: string,
    eventId: string,
    label?: string,
    copyFromLayoutId?: string | null,
    copyOptions?: {
      tables: boolean;
      areas: boolean;
    },
  ) => Promise<void>;
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
  onChangeTableType: (tableId: string, tableTypeId: string) => Promise<void>;
  onUpdateTable: (tableId: string, name: string) => Promise<void>;
  onResizeArea: (areaId: string, widthM: number, lengthM: number) => Promise<void>;
  onSaveAllocations: (registrationId: string, allocations: TableAllocation[]) => Promise<void>;
  authHeaders: () => Record<string, string>;
  onSaveRevision: (layoutId: string, label: string, changeNote?: string) => Promise<LayoutRevision>;
  onRestoreRevision: (
    layoutId: string,
    revisionNumber: number,
    resolveAllocations?: boolean,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// DraggableTable
// ---------------------------------------------------------------------------

interface DraggableTableProps {
  table: FloorTable;
  tableTypes: TableType[];
  assignedCount: number;
  exclusive: boolean;
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
  exclusive,
  isSelected,
  isInteractive,
  isInSelectedArea,
  onClick,
  canvasW,
  canvasH,
}: DraggableTableProps) {
  const { ref, isDragging } = useDraggable({
    id: table.id,
    disabled: !isInteractive,
  });

  const { width: TABLE_W, height: TABLE_L } = getTableSizePx(table, tableTypes);
  const type = tableTypes.find((t) => t.id === table.tableTypeId);
  const shape = type?.shape ?? "rectangle";

  const leftPx = (table.x / 100) * canvasW;
  const topPx = (table.y / 100) * canvasH;

  const isOverfilled = table.capacity > 0 && assignedCount > table.capacity;
  const isFull = exclusive || (table.capacity > 0 && assignedCount === table.capacity);
  const borderCls = isSelected
    ? "border-warning"
    : isOverfilled
      ? "border-danger"
      : isFull
        ? "border-warning"
        : assignedCount > 0
          ? "border-success"
          : "border-secondary";
  const bgCls = isSelected
    ? "bg-warning bg-opacity-25 tw:text-highlight"
    : isOverfilled
      ? "bg-danger bg-opacity-10 tw:text-destructive"
      : isFull
        ? "bg-warning bg-opacity-10 tw:text-highlight"
        : assignedCount > 0
          ? "bg-success bg-opacity-10 tw:text-success"
          : "bg-dark tw:text-subtle";

  return (
    <div
      ref={ref}
      onClick={(e) => {
        if (!isInteractive) return;
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "tw:absolute tw:flex tw:flex-col tw:items-center tw:justify-center border tw:text-center",
        shape === "round" ? "rounded-circle" : "rounded",
        borderCls,
        bgCls,
      )}
      style={{
        left: leftPx,
        top: topPx,
        width: TABLE_W,
        height: TABLE_L,
        cursor: isDragging ? "grabbing" : isInteractive ? "grab" : "default",
        userSelect: "none",
        transform: `rotate(${table.rotation}deg)`,
        zIndex: isDragging ? 10 : 1,
        opacity: isInteractive ? (isDragging ? 0.8 : 1) : isInSelectedArea ? 0.7 : 0.25,
        transition: isDragging ? undefined : "border-color 0.15s, opacity 0.15s",
        pointerEvents: isInteractive ? undefined : "none",
      }}
      title={`${table.name} — ${assignedCount}/${table.capacity}`}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? isSelected : undefined}
      aria-label={`${m.admin_table_label()} ${table.name}`}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <Icon icon={UsersIcon} className="tw:text-xl" />
      <span className="tw:text-sm tw:font-semibold tw:text-tiny">{table.name}</span>
      <span className="tw:text-micro">
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
  const { ref, isDragging } = useDraggable({
    id: area.id,
    disabled: !isInteractive,
  });

  const { width: AREA_W, height: AREA_H } = getAreaSizePx(area.widthM, area.lengthM);

  const leftPx = (area.x / 100) * canvasW;
  const topPx = (area.y / 100) * canvasH;

  const borderCls = isSelected ? "border-warning" : "border-info";
  const bgCls = isSelected
    ? "bg-warning bg-opacity-25 tw:text-highlight"
    : "bg-info bg-opacity-10 tw:text-info";
  const fadedStyle = !isInteractive ? { opacity: 0.25, pointerEvents: "none" as const } : {};

  return (
    <div
      ref={ref}
      onClick={(e) => {
        if (!isInteractive) return;
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "tw:absolute tw:flex tw:flex-col tw:items-center tw:justify-center border tw:text-center rounded",
        borderCls,
        bgCls,
      )}
      style={{
        left: leftPx,
        top: topPx,
        width: AREA_W,
        height: AREA_H,
        cursor: isDragging ? "grabbing" : isInteractive ? "grab" : "default",
        userSelect: "none",
        transform: `rotate(${area.rotation}deg)`,
        zIndex: isDragging ? 10 : 2,
        opacity: isDragging ? 0.8 : 1,
        transition: isDragging ? undefined : "border-color 0.15s",
        ...fadedStyle,
      }}
      title={area.label}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? isSelected : undefined}
      aria-label={`${m.admin_layout_area_label_prefix()} ${area.label}`}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <AreaIcon name={area.icon} className="tw:text-xs" />
      <span className="tw:font-semibold tw:truncate tw:w-full tw:text-center tw:px-1 tw:text-micro">
        {area.label}
      </span>
      {assignedLabel && (
        <span
          className="tw:truncate tw:w-full tw:text-center tw:px-1 tw:text-plan"
          style={{ opacity: 0.85 }}
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
  registrations: Registration[];
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
  registrations,
  exhibitors,
  layer,
  selectedTable,
  selectedArea,
  onSelectTable,
  onSelectArea,
  onMoveTable,
  onMoveArea,
}: RoomCanvasProps) {
  const { width: canvasW, height: canvasH } = getCanvasSizePx(room.widthM, room.lengthM);

  const canvasRef = useRef<HTMLDivElement>(null);

  // RestrictToElement is called at drag time so canvasRef.current is always current.
  // The lint rule against reading refs during render can't see that this accessor
  // is only invoked later (dnd-kit's documented pattern for a not-yet-mounted
  // element), and oxlint has no way to suppress it inline for this rule.
  const modifiers = useMemo(
    () => [RestrictToElement.configure({ element: () => canvasRef.current })],
    [],
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
        const { width: AREA_W, height: AREA_H } = getAreaSizePx(area.widthM, area.lengthM);
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
    <div className="tw:overflow-auto tw:pb-2">
      <p className="tw:text-subtle tw:text-sm tw:mb-1">
        {room.widthM} m × {room.lengthM} m
        <span className="tw:ms-2">
          <Icon icon={InfoIcon} className="tw:me-1" />
          {m.admin_table_move_hint()}
        </span>
      </p>
      <p className="tw:sr-only">{m.admin_layout_keyboard_hint()}</p>
      <DragDropProvider sensors={SENSORS} modifiers={modifiers} onDragEnd={handleDragEnd}>
        <div
          ref={canvasRef}
          onClick={() => {
            onSelectTable(null);
            onSelectArea(null);
          }}
          className="tw:relative border rounded"
          style={{
            width: canvasW,
            height: canvasH,
            borderColor: room.color,
            background:
              "repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(255,255,255,0.04) 27px,rgba(255,255,255,0.04) 28px)," +
              "repeating-linear-gradient(90deg,transparent,transparent 27px,rgba(255,255,255,0.04) 27px,rgba(255,255,255,0.04) 28px)",
            overflow: "visible",
            cursor: "default",
          }}
          aria-label={room.name}
        >
          {isEmpty && (
            <div className="tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:text-subtle tw:text-center tw:pointer-events-none">
              <Icon icon={Grid3X3Icon} className="tw:text-5xl" />
              <p className="tw:mt-2 tw:text-sm">{m.admin_no_tables()}</p>
            </div>
          )}
          {roomTables.map((table) => {
            const assigned = registrations
              .filter((r) => r.status !== "cancelled" && table.registrationIds.includes(r.id))
              .reduce(
                (sum, r) =>
                  sum + (r.allocations?.find((a) => a.tableId === table.id)?.guestCount ?? 0),
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
                    r.allocations?.some((a) => a.tableId === table.id && a.exclusive),
                )}
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
      </DragDropProvider>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayoutEditor (main export)
// ---------------------------------------------------------------------------

export default function LayoutEditor({
  dayOptions,
  tables,
  tableTypes,
  layouts,
  registrations,
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
  onChangeTableType,
  onUpdateTable,
  onResizeArea,
  onSaveAllocations,
  authHeaders,
  onSaveRevision,
  onRestoreRevision,
}: LayoutEditorProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [showCompareLayouts, setShowCompareLayouts] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [layer, setLayer] = useState<"seating" | "areas">("seating");

  // Auto-select first room. Adjusted during render rather than in an effect:
  // the guard is idempotent (it stops applying the moment a room is picked),
  // so this only ever fires the one time it needs to.
  if (!activeRoomId && rooms.length > 0) {
    setActiveRoomId(rooms[0]?.id ?? null);
  }

  // Auto-select first layout when active room changes, or clamp back to a
  // valid one if the current selection is no longer in this room's layouts
  // (also idempotent — see above).
  if (activeRoomId) {
    const roomLayouts = layouts.filter((l) => l.roomId === activeRoomId);
    if (roomLayouts.length === 0) {
      if (activeLayoutId !== null) setActiveLayoutId(null);
    } else if (!roomLayouts.find((l) => l.id === activeLayoutId)) {
      setActiveLayoutId(roomLayouts[0]?.id ?? null);
    }
  }

  // Add Layout modal
  const [showAddLayout, setShowAddLayout] = useState(false);
  const [newLayout, setNewLayout] = useState(() => getInitialNewLayoutState(dayOptions));
  const [addLayoutError, setAddLayoutError] = useState<string | null>(null);
  const [confirmDeleteLayoutId, setConfirmDeleteLayoutId] = useState<string | null>(null);

  const handleAddLayout = useCallback(async () => {
    if (!activeRoomId) return;
    setAddLayoutError(null);
    try {
      if (!newLayout.eventId) return;
      await onAddLayout(
        activeRoomId,
        newLayout.eventId,
        undefined,
        newLayout.copyFromLayoutId || undefined,
        {
          tables: newLayout.copyTables,
          areas: newLayout.copyAreas,
        },
      );
      setNewLayout(getInitialNewLayoutState(dayOptions));
      setShowAddLayout(false);
    } catch (err) {
      devError("Failed to add layout", err);
      setAddLayoutError(err instanceof Error ? err.message : m.admin_error_add_layout());
    }
  }, [activeRoomId, dayOptions, newLayout, onAddLayout]);

  // Keep the add-layout form's date valid as dayOptions loads or changes.
  // Adjusted during render rather than in an effect — idempotent once the
  // date is valid, same as the room/layout selection above.
  if (dayOptions.length > 0 && !dayOptions.some((day) => day.eventId === newLayout.eventId)) {
    setNewLayout((current) => ({ ...current, eventId: dayOptions[0]!.eventId }));
  }

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      try {
        await onDeleteLayout(layoutId);
        if (activeLayoutId === layoutId) {
          setActiveLayoutId(null);
          setSelectedTable(null);
          setSelectedArea(null);
        }
      } catch (err) {
        devError("Failed to delete layout", err);
        throw err;
      }
    },
    [onDeleteLayout, activeLayoutId],
  );

  // Add Table modal
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTable, setNewTable] = useState({
    name: "",
    tableTypeId: "",
  });
  const [addTableError, setAddTableError] = useState<string | null>(null);

  const [confirmDeleteTableId, setConfirmDeleteTableId] = useState<string | null>(null);
  const [updateTableError, setUpdateTableError] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [allocationPending, setAllocationPending] = useState(false);
  const [bookingToAssign, setBookingToAssign] = useState("");
  const [guestsToAssign, setGuestsToAssign] = useState(1);
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
  const [confirmDeleteAreaId, setConfirmDeleteAreaId] = useState<string | null>(null);
  const [assignAreaError, setAssignAreaError] = useState<string | null>(null);
  const [resizeAreaError, setResizeAreaError] = useState<string | null>(null);

  const handleAddTable = useCallback(async () => {
    if (!newTable.name.trim() || !newTable.tableTypeId || !activeLayoutId) return;
    setAddTableError(null);
    try {
      await onAddTable(newTable.name.trim(), activeLayoutId, newTable.tableTypeId);
      setNewTable({ name: "", tableTypeId: "" });
      setShowAddTable(false);
    } catch (err) {
      devError("Failed to add table", err);
      setAddTableError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [newTable, onAddTable, activeLayoutId]);

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      try {
        await onDeleteTable(tableId);
        setSelectedTable(null);
      } catch (err) {
        devError("Failed to delete table", err);
        throw err;
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
      devError("Failed to add area", err);
      setAddAreaError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [newArea, onAddArea, activeLayoutId]);

  const handleDeleteArea = useCallback(
    async (areaId: string) => {
      try {
        await onDeleteArea(areaId);
        setSelectedArea(null);
      } catch (err) {
        devError("Failed to delete area", err);
        throw err;
      }
    },
    [onDeleteArea],
  );

  const selectedTableData = tables.find((t) => t.id === selectedTable);
  const selectedType = tableTypes.find((t) => t.id === selectedTableData?.tableTypeId);
  const selectedRegistrations = selectedTableData
    ? registrations.filter((r) => selectedTableData.registrationIds.includes(r.id))
    : [];

  const activeLayout = layouts.find((l) => l.id === activeLayoutId);
  const eventLayoutIds = new Set(
    layouts.filter((layout) => layout.eventId === activeLayout?.eventId).map((layout) => layout.id),
  );
  const eventTables = tables.filter((table) => eventLayoutIds.has(table.layoutId));
  const assignableRegistrations = registrations.filter((registration) => {
    if (registration.status === "cancelled" || registration.eventId !== activeLayout?.eventId)
      return false;
    if (
      registration.allocations?.some((allocation) => allocation.tableId === selectedTableData?.id)
    )
      return false;
    const used = registration.bookedTableQuantity
      ? (registration.allocations?.length ?? 0)
      : (registration.allocations?.reduce((sum, allocation) => sum + allocation.guestCount, 0) ??
        0);
    return used < (registration.bookedTableQuantity || registration.guestCount);
  });
  const selectedBookingToAssign = assignableRegistrations.find(
    (item) => item.id === bookingToAssign,
  );

  const savePlanAllocations = async (
    registration: Registration,
    allocations: TableAllocation[],
  ) => {
    setAllocationError(null);
    setAllocationPending(true);
    try {
      await onSaveAllocations(registration.id, allocations);
    } catch (error) {
      setAllocationError(error instanceof Error ? error.message : m.admin_error_assign_table());
    } finally {
      setAllocationPending(false);
    }
  };
  const activeLayoutDateLabel = useMemo(
    () => (activeLayout ? getDayLabel(activeLayout, dayOptions) : ""),
    [activeLayout, dayOptions],
  );
  const activeRoom = rooms.find((r) => r.id === (activeLayout?.roomId ?? activeRoomId));
  const roomLayouts = layouts
    .filter((l) => l.roomId === activeRoomId)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const canvasTables = activeLayoutId ? tables.filter((t) => t.layoutId === activeLayoutId) : [];
  const canvasAreas = activeLayoutId ? areas.filter((a) => a.layoutId === activeLayoutId) : [];

  const selectedAreaData = canvasAreas.find((a) => a.id === selectedArea);

  const areaCanvas = activeRoom ? getCanvasSizePx(activeRoom.widthM, activeRoom.lengthM) : null;
  const areaCanvasW = areaCanvas?.width ?? 0;
  const areaCanvasH = areaCanvas?.height ?? 0;
  const tablesInSelectedArea = selectedAreaData
    ? getTablesInArea(selectedAreaData, canvasTables, tableTypes, areaCanvasW, areaCanvasH)
    : [];

  // The Add Table type list is venue-filtered (below), so a selection carried
  // over from a previously active room in another venue would otherwise let
  // Save submit a table type that doesn't belong to this room's venue (#858).
  // Adjusted during render rather than in an effect — idempotent once the
  // selection is cleared or valid again for the active room's venue.
  if (
    newTable.tableTypeId &&
    !tableTypes.some((tt) => tt.id === newTable.tableTypeId && tt.venueId === activeRoom?.venueId)
  ) {
    setNewTable((p) => ({ ...p, tableTypeId: "" }));
  }

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
      <Card bg="dark" text="white" border="secondary" className="tw:mb-4">
        <Card.Header className="tw:flex tw:items-center tw:justify-between tw:flex-wrap tw:gap-2">
          {activeLayoutDateLabel && (
            <span className="tw:text-subtle tw:text-sm tw:hidden tw:site-md:inline">
              <Icon icon={CalendarIcon} className="tw:me-1" />
              {activeLayoutDateLabel}
            </span>
          )}
          <div
            data-tailwind-migrated="true"
            className="tw:flex tw:flex-wrap tw:gap-1"
            role="group"
            aria-label={m.admin_rooms_tab()}
          >
            {rooms.map((room) => {
              const roomTableCount = layouts
                .filter((l) => l.roomId === room.id)
                .reduce((sum, l) => sum + tables.filter((t) => t.layoutId === l.id).length, 0);
              return (
                <span key={room.id}>
                  <RoomButton
                    size="sm"
                    variant={activeRoomId === room.id ? "default" : "ghost"}
                    aria-pressed={activeRoomId === room.id}
                    onClick={() => handleSelectRoom(room.id)}
                  >
                    <span
                      className="tw:mr-1 tw:inline-block tw:size-2.5 tw:rounded-full"
                      style={{
                        background: room.color,
                      }}
                      aria-hidden="true"
                    />
                    {room.name}
                    <span className="tw:ml-1 tw:rounded tw:bg-muted tw:px-1 tw:text-xs tw:text-muted-foreground">
                      {roomTableCount}
                    </span>
                  </RoomButton>
                </span>
              );
            })}
          </div>
          <div className="tw:flex tw:gap-2 tw:items-center">
            <div className="btn-group btn-group-sm" role="group" aria-label="Layer">
              <Button
                variant={layer === "seating" ? "warning" : "outline-secondary"}
                size="sm"
                onClick={() => {
                  setLayer("seating");
                  setSelectedArea(null);
                }}
              >
                <Icon icon={UsersIcon} className="tw:me-1" />
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
                <Icon icon={StoreIcon} className="tw:me-1" />
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
                <Icon icon={PlusIcon} className="tw:me-1" />
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
                <Icon icon={PlusIcon} className="tw:me-1" />
                {m.admin_layout_add_area()}
              </Button>
            )}
          </div>
        </Card.Header>

        <Card.Body className="tw:p-2">
          {rooms.length === 0 ? (
            <p className="tw:text-subtle tw:text-center tw:text-sm tw:mb-0">
              <Icon icon={InfoIcon} className="tw:me-1" />
              {m.admin_room_no_rooms()}
            </p>
          ) : activeRoom ? (
            <div>
              <div className="tw:flex tw:items-center tw:justify-between tw:mb-2">
                <div className="tw:flex tw:items-center tw:gap-2">
                  <span className="tw:font-semibold" style={{ color: activeRoom.color }}>
                    <Icon icon={BuildingIcon} className="tw:me-1" />
                    {activeRoom.name}
                  </span>
                  {/* Day / layout selector */}
                  <div className="tw:flex tw:flex-wrap tw:gap-1 tw:items-center">
                    {roomLayouts.map((layout) => (
                      <div key={layout.id} className="tw:flex tw:items-center tw:gap-0">
                        <Button
                          size="sm"
                          variant={activeLayoutId === layout.id ? "warning" : "outline-secondary"}
                          onClick={() => {
                            setActiveLayoutId(layout.id);
                            setSelectedTable(null);
                          }}
                          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                        >
                          {getDayLabel(layout, dayOptions)}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => setConfirmDeleteLayoutId(layout.id)}
                          title={m.admin_delete()}
                          aria-label={m.admin_delete()}
                          style={{
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                            borderLeft: "none",
                          }}
                        >
                          <Icon icon={XIcon} />
                        </Button>
                      </div>
                    ))}
                    {roomLayouts.length === 0 && (
                      <span className="tw:text-subtle tw:text-sm">{m.admin_no_layouts()}</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline-success"
                      onClick={() => {
                        setAddLayoutError(null);
                        setNewLayout(getInitialNewLayoutState(dayOptions));
                        setShowAddLayout(true);
                      }}
                      title={m.admin_add_layout()}
                    >
                      <Icon icon={PlusIcon} className="tw:me-1" />
                      {m.admin_add_layout()}
                    </Button>
                    {roomLayouts.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline-info"
                        onClick={() => setShowCompareLayouts(true)}
                        title={m.admin_layout_compare_title()}
                      >
                        <Icon icon={ArrowLeftRightIcon} className="tw:me-1" />
                        {m.admin_layout_compare_title()}
                      </Button>
                    )}
                    {activeLayoutId && (
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => setShowRevisions(true)}
                        title={m.admin_layout_revisions_button()}
                      >
                        <Icon icon={HistoryIcon} className="tw:me-1" />
                        {m.admin_layout_revisions_button()}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {activeLayoutId ? (
                <RoomCanvas
                  room={activeRoom}
                  roomTables={canvasTables}
                  roomAreas={canvasAreas}
                  tableTypes={tableTypes}
                  registrations={registrations}
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
                <p className="tw:text-subtle tw:text-center tw:text-sm tw:py-6 tw:mb-0">
                  {m.admin_no_layouts()}
                </p>
              )}
            </div>
          ) : null}
        </Card.Body>
      </Card>

      {/* Selected table detail */}
      {selectedTableData && (
        <Card bg="dark" text="white" border="warning" className="tw:mb-4">
          <Card.Header className="tw:flex tw:items-center tw:justify-between border-warning">
            <span className="tw:font-semibold">
              <Icon icon={TableIcon} className="tw:me-2" />
              {m.admin_table_label()}: {selectedTableData.name}
            </span>
            <div className="tw:flex tw:gap-2 tw:items-center">
              <Badge bg="secondary">
                {selectedTableData.capacity} {m.admin_guests_count()}
              </Badge>
              {selectedType && (
                <Badge bg="secondary" className="tw:text-content">
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
              {selectedType?.shape !== "round" && (
                <>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() =>
                      onRotateTable(selectedTableData.id, selectedTableData.rotation - 15)
                    }
                    title={m.admin_layout_rotate_ccw()}
                    aria-label={m.admin_layout_rotate_ccw()}
                  >
                    <Icon icon={RotateCcwIcon} />
                  </Button>
                  <span
                    className="tw:text-subtle tw:text-sm"
                    style={{ minWidth: "3.5rem", textAlign: "center" }}
                  >
                    {Math.round(selectedTableData.rotation)}°
                  </span>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() =>
                      onRotateTable(selectedTableData.id, selectedTableData.rotation + 15)
                    }
                    title={m.admin_layout_rotate_cw()}
                    aria-label={m.admin_layout_rotate_cw()}
                  >
                    <Icon icon={RotateCwIcon} />
                  </Button>
                </>
              )}
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => setConfirmDeleteTableId(selectedTableData.id)}
                title={m.admin_delete()}
                aria-label={m.admin_delete()}
              >
                <Icon icon={TrashIcon} />
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            {updateTableError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="tw:py-1 tw:mb-2 tw:text-sm"
              >
                {updateTableError}
              </Alert>
            )}
            {allocationError && (
              <Alert role="alert" variant="danger" className="tw:py-1 tw:mb-2 tw:text-sm">
                {allocationError}
              </Alert>
            )}
            <Form.Group className="tw:mb-4" controlId="table-name-edit">
              <Form.Label className="tw:text-subtle tw:text-sm">{m.admin_table_name()}</Form.Label>
              <Form.Control
                size="sm"
                type="text"
                className="bg-dark tw:text-content border-secondary"
                defaultValue={selectedTableData.name}
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  if (val && val !== selectedTableData.name) {
                    setUpdateTableError(null);
                    try {
                      await onUpdateTable(selectedTableData.id, val);
                    } catch (err) {
                      setUpdateTableError(
                        err instanceof Error ? err.message : m.admin_content_error_save(),
                      );
                    }
                  }
                }}
                key={`name-${selectedTableData.id}`}
              />
            </Form.Group>
            <Form.Group className="tw:mb-4" controlId="table-type-select">
              <Form.Label className="tw:text-subtle tw:text-sm">
                {m.admin_layout_table_type_label()}
              </Form.Label>
              <Form.Select
                size="sm"
                className="bg-dark tw:text-content border-secondary"
                value={selectedTableData.tableTypeId}
                onChange={async (e) => {
                  setUpdateTableError(null);
                  try {
                    await onChangeTableType(selectedTableData.id, e.target.value);
                  } catch (err) {
                    setUpdateTableError(
                      err instanceof Error ? err.message : m.admin_content_error_save(),
                    );
                  }
                }}
                key={`type-${selectedTableData.id}`}
              >
                {tableTypes
                  .filter(
                    (tt) =>
                      (tt.venueId === activeRoom?.venueId ||
                        tt.id === selectedTableData.tableTypeId) &&
                      (tt.active || tt.id === selectedTableData.tableTypeId),
                  )
                  .map((tt) => (
                    <option key={tt.id} value={tt.id} disabled={!tt.active}>
                      {tt.name}
                    </option>
                  ))}
              </Form.Select>
            </Form.Group>
            {selectedRegistrations.length === 0 ? (
              <p className="tw:text-subtle tw:mb-0">{m.admin_unassigned()}</p>
            ) : (
              <ListGroup variant="flush" className="tw:mb-4">
                {selectedRegistrations.map((r) => (
                  <ListGroup.Item key={r.id} className="bg-dark tw:text-content border-secondary">
                    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                      <span className="tw:font-semibold tw:me-auto">{r.person.name}</span>
                      {(() => {
                        const allocation = r.allocations?.find(
                          (item) => item.tableId === selectedTableData.id,
                        );
                        if (!allocation) return null;
                        return (
                          <>
                            <Form.Control
                              aria-label={`${m.admin_guests_count()} ${r.person.name}`}
                              type="number"
                              min={allocation.exclusive ? 0 : 1}
                              max={20}
                              defaultValue={allocation.guestCount}
                              disabled={allocationPending || allocation.exclusive}
                              className="bg-dark tw:text-content border-secondary"
                              style={{ width: "5rem" }}
                              onBlur={(event) => {
                                const guestCount = Number(event.currentTarget.value);
                                if (
                                  Number.isInteger(guestCount) &&
                                  guestCount >= 1 &&
                                  guestCount !== allocation.guestCount
                                ) {
                                  void savePlanAllocations(
                                    r,
                                    (r.allocations ?? []).map((item) =>
                                      item.tableId === selectedTableData.id
                                        ? { ...item, guestCount }
                                        : item,
                                    ),
                                  );
                                }
                              }}
                            />
                            <Form.Select
                              aria-label={`${m.admin_layout_move_booking()} ${r.person.name}`}
                              size="sm"
                              value={selectedTableData.id}
                              disabled={allocationPending}
                              onChange={(event) =>
                                void savePlanAllocations(
                                  r,
                                  (r.allocations ?? []).map((item) =>
                                    item.tableId === selectedTableData.id
                                      ? { ...item, tableId: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {eventTables
                                .filter(
                                  (table) =>
                                    table.id === selectedTableData.id ||
                                    !(r.allocations ?? []).some(
                                      (item) => item.tableId === table.id,
                                    ),
                                )
                                .map((table) => (
                                  <option key={table.id} value={table.id}>
                                    {table.name}
                                  </option>
                                ))}
                            </Form.Select>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={allocationPending}
                              onClick={() =>
                                void savePlanAllocations(
                                  r,
                                  (r.allocations ?? []).filter(
                                    (item) => item.tableId !== selectedTableData.id,
                                  ),
                                )
                              }
                            >
                              {m.admin_layout_remove_booking()}
                            </Button>
                          </>
                        );
                      })()}
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
            <div className="border-top border-secondary tw:pt-4 tw:mt-4">
              <Form.Label className="tw:text-subtle tw:text-sm">
                {m.admin_layout_assign_booking()}
              </Form.Label>
              <div className="tw:flex tw:flex-wrap tw:gap-2">
                <Form.Select
                  aria-label={m.admin_layout_assign_booking()}
                  value={bookingToAssign}
                  disabled={allocationPending || assignableRegistrations.length === 0}
                  onChange={(event) => {
                    const id = event.target.value;
                    const booking = assignableRegistrations.find((item) => item.id === id);
                    const alreadyAssigned =
                      booking?.allocations?.reduce((sum, item) => sum + item.guestCount, 0) ?? 0;
                    setBookingToAssign(id);
                    setGuestsToAssign(
                      booking?.bookedTableQuantity
                        ? 0
                        : Math.max(1, (booking?.guestCount ?? 1) - alreadyAssigned),
                    );
                  }}
                >
                  <option value="">{m.admin_layout_choose_booking()}</option>
                  {assignableRegistrations.map((registration) => (
                    <option key={registration.id} value={registration.id}>
                      {registration.person.name} · {registration.id}
                    </option>
                  ))}
                </Form.Select>
                <Form.Control
                  aria-label={m.admin_guests_count()}
                  type="number"
                  min={selectedBookingToAssign?.bookedTableQuantity ? 0 : 1}
                  max={20}
                  value={guestsToAssign}
                  disabled={
                    allocationPending ||
                    !bookingToAssign ||
                    Boolean(selectedBookingToAssign?.bookedTableQuantity)
                  }
                  onChange={(event) => setGuestsToAssign(Number(event.target.value))}
                  style={{ width: "6rem" }}
                />
                <Button
                  variant="warning"
                  disabled={allocationPending || !selectedBookingToAssign}
                  onClick={async () => {
                    if (!selectedBookingToAssign) return;
                    await savePlanAllocations(selectedBookingToAssign, [
                      ...(selectedBookingToAssign.allocations ?? []),
                      {
                        tableId: selectedTableData.id,
                        guestCount: selectedBookingToAssign.bookedTableQuantity
                          ? 0
                          : guestsToAssign,
                        exclusive: Boolean(selectedBookingToAssign.bookedTableQuantity),
                      },
                    ]);
                    setBookingToAssign("");
                  }}
                >
                  {m.admin_layout_assign_booking()}
                </Button>
              </div>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Selected area detail */}
      {selectedAreaData && (
        <Card bg="dark" text="white" border="info" className="tw:mb-4">
          <Card.Header className="tw:flex tw:items-center tw:justify-between border-info">
            <span className="tw:font-semibold">
              <AreaIcon name={selectedAreaData.icon} className="tw:me-2" />
              {m.admin_layout_area_label_prefix()} {selectedAreaData.label}
            </span>
            <div className="tw:flex tw:gap-2 tw:items-center">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => onRotateArea(selectedAreaData.id, selectedAreaData.rotation - 15)}
                title={m.admin_layout_rotate_ccw()}
                aria-label={m.admin_layout_rotate_ccw()}
              >
                <Icon icon={RotateCcwIcon} />
              </Button>
              <span
                className="tw:text-subtle tw:text-sm"
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
                <Icon icon={RotateCwIcon} />
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => setConfirmDeleteAreaId(selectedAreaData.id)}
                title={m.admin_delete()}
                aria-label={m.admin_delete()}
              >
                <Icon icon={TrashIcon} />
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            {assignAreaError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="tw:py-1 tw:mb-2 tw:text-sm"
                dismissible
                onClose={() => setAssignAreaError(null)}
              >
                {assignAreaError}
              </Alert>
            )}
            {resizeAreaError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="tw:py-1 tw:mb-2 tw:text-sm"
                dismissible
                onClose={() => setResizeAreaError(null)}
              >
                {resizeAreaError}
              </Alert>
            )}
            <Form.Group className="tw:mb-4" controlId="area-label">
              <Form.Label className="tw:text-subtle tw:text-sm">
                {m.admin_layout_area_form_label()}
              </Form.Label>
              <Form.Control
                size="sm"
                type="text"
                className="bg-dark tw:text-content border-secondary"
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
            <div className="tw:flex tw:gap-2 tw:mb-4">
              <Form.Group controlId="area-width" className="tw:flex-1">
                <Form.Label className="tw:text-subtle tw:text-sm">
                  {m.admin_layout_area_width_m()}
                </Form.Label>
                <Form.Control
                  size="sm"
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.1}
                  className="bg-dark tw:text-content border-secondary"
                  defaultValue={selectedAreaData.widthM}
                  onBlur={async (e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0 && val !== selectedAreaData.widthM) {
                      setResizeAreaError(null);
                      try {
                        await onResizeArea(selectedAreaData.id, val, selectedAreaData.lengthM);
                      } catch (err) {
                        setResizeAreaError(
                          err instanceof Error ? err.message : m.admin_content_error_save(),
                        );
                      }
                    }
                  }}
                  key={`w-${selectedAreaData.id}`}
                />
              </Form.Group>
              <Form.Group controlId="area-length" className="tw:flex-1">
                <Form.Label className="tw:text-subtle tw:text-sm">
                  {m.admin_layout_area_length_m()}
                </Form.Label>
                <Form.Control
                  size="sm"
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.1}
                  className="bg-dark tw:text-content border-secondary"
                  defaultValue={selectedAreaData.lengthM}
                  onBlur={async (e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0 && val !== selectedAreaData.lengthM) {
                      setResizeAreaError(null);
                      try {
                        await onResizeArea(selectedAreaData.id, selectedAreaData.widthM, val);
                      } catch (err) {
                        setResizeAreaError(
                          err instanceof Error ? err.message : m.admin_content_error_save(),
                        );
                      }
                    }
                  }}
                  key={`l-${selectedAreaData.id}`}
                />
              </Form.Group>
            </div>
            <Form.Group className="tw:mb-4" controlId="area-icon">
              <Form.Label className="tw:text-subtle tw:text-sm">
                {m.admin_layout_area_form_icon()}
              </Form.Label>
              <div className="tw:flex tw:gap-2 tw:items-center">
                <AreaIcon name={selectedAreaData.icon} className="tw:text-primary" />
                <Form.Select
                  size="sm"
                  className="bg-dark tw:text-content border-secondary"
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
                        err instanceof Error ? err.message : m.admin_content_error_save(),
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
              <Form.Label className="tw:text-subtle tw:text-sm">
                {m.admin_layout_area_assigned_to()}
              </Form.Label>
              <Form.Select
                size="sm"
                className="bg-dark tw:text-content border-secondary"
                value={selectedAreaData.exhibitorId ? `e:${selectedAreaData.exhibitorId}` : ""}
                onChange={async (ev) => {
                  const val = ev.target.value;
                  setAssignAreaError(null);
                  try {
                    let eId: number | null = null;
                    if (val.startsWith("e:")) {
                      eId = Number(val.slice(2));
                    }
                    await onAssignAreaToItem(selectedAreaData.id, eId);
                  } catch (err) {
                    setAssignAreaError(
                      err instanceof Error ? err.message : m.admin_content_error_save(),
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
              <div className="tw:mt-4 tw:pt-4 border-top border-secondary">
                <p className="tw:text-subtle tw:text-sm tw:mb-2">
                  <Icon icon={Grid3X3Icon} className="tw:me-1" />
                  {m.admin_layout_tables_in_stand()}{" "}
                  <Badge bg="info" text="dark">
                    {tablesInSelectedArea.length}
                  </Badge>
                  <span className="tw:ms-2 tw:text-subtle">
                    {tablesInSelectedArea.reduce((s, t) => s + t.capacity, 0)}{" "}
                    {m.admin_layout_places_total()}
                  </span>
                </p>
                <ListGroup variant="flush">
                  {tablesInSelectedArea.map((t) => (
                    <ListGroup.Item
                      key={t.id}
                      className="bg-dark tw:text-content border-secondary tw:py-1 tw:px-2 tw:text-sm"
                    >
                      <Icon icon={Grid3X3Icon} className="tw:me-1 tw:text-muted-foreground" />
                      {t.name}
                      <Badge bg="secondary" className="tw:ms-2 tw:text-micro">
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
      <Dialog
        open={showAddLayout}
        onOpenChange={(open) => {
          if (!open) setShowAddLayout(false);
        }}
      >
        <DialogContent admin size="default">
          <DialogHeader>
            <DialogTitle id="add-layout-modal-title">{m.admin_add_layout()}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {addLayoutError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="tw:py-1 tw:mb-4 tw:text-sm"
              >
                {addLayoutError}
              </Alert>
            )}
            <Form.Group className="tw:mb-4" controlId="layout-day">
              <Form.Label>{m.admin_layout_day_label()}</Form.Label>
              <Form.Select
                value={newLayout.eventId}
                onChange={(e) => setNewLayout((p) => ({ ...p, eventId: e.target.value }))}
                className="bg-dark tw:text-content border-secondary"
              >
                {dayOptions.map((day) => (
                  <option key={day.eventId} value={day.eventId}>
                    {day.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group controlId="layout-copy-from">
              <Form.Label>{m.admin_layout_copy_from_label()}</Form.Label>
              <Form.Select
                value={newLayout.copyFromLayoutId}
                onChange={(e) => setNewLayout((p) => ({ ...p, copyFromLayoutId: e.target.value }))}
                className="bg-dark tw:text-content border-secondary"
              >
                <option value="">{m.admin_layout_copy_from_empty()}</option>
                {roomLayouts.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {getDayLabel(layout, dayOptions)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            {newLayout.copyFromLayoutId && (
              <div className="tw:mt-4 tw:flex tw:flex-col tw:gap-2">
                <Form.Check
                  id="layout-copy-tables"
                  type="checkbox"
                  className="tw:text-sm"
                  checked={newLayout.copyTables}
                  onChange={(e) =>
                    setNewLayout((p) => ({ ...p, copyTables: e.currentTarget.checked }))
                  }
                  label={m.admin_layout_copy_tables()}
                />
                <Form.Check
                  id="layout-copy-areas"
                  type="checkbox"
                  className="tw:text-sm"
                  checked={newLayout.copyAreas}
                  onChange={(e) =>
                    setNewLayout((p) => ({
                      ...p,
                      copyAreas: e.currentTarget.checked,
                    }))
                  }
                  label={m.admin_layout_copy_areas()}
                />
                {newLayout.copyAreas && (
                  <div className="tw:text-subtle tw:text-sm">
                    {m.admin_layout_copy_areas_hint()}
                  </div>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddLayout(false)}>
              {m.admin_action_cancel()}
            </Button>
            <Button variant="success" onClick={handleAddLayout}>
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Area Modal */}
      <Dialog
        open={showAddArea}
        onOpenChange={(open) => {
          if (!open) setShowAddArea(false);
        }}
      >
        <DialogContent admin size="default">
          <DialogHeader>
            <DialogTitle id="add-area-modal-title">{m.admin_layout_add_area()}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {addAreaError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="tw:py-1 tw:mb-4 tw:text-sm"
              >
                {addAreaError}
              </Alert>
            )}
            <Form.Group className="tw:mb-4" controlId="area-new-label">
              <Form.Label>{m.admin_layout_area_form_label()}</Form.Label>
              <Form.Control
                type="text"
                value={newArea.label}
                onChange={(e) => setNewArea((p) => ({ ...p, label: e.target.value }))}
                className="bg-dark tw:text-content border-secondary"
                placeholder={m.admin_layout_area_label_placeholder()}
              />
            </Form.Group>
            <Form.Group className="tw:mb-4" controlId="area-new-icon">
              <Form.Label>{m.admin_layout_area_form_icon()}</Form.Label>
              <div className="tw:flex tw:gap-2 tw:items-center">
                <AreaIcon name={newArea.icon} className="tw:text-2xl tw:text-primary" />
                <Form.Select
                  value={newArea.icon}
                  onChange={(e) => setNewArea((p) => ({ ...p, icon: e.target.value }))}
                  className="bg-dark tw:text-content border-secondary"
                >
                  {getAreaIcons().map((ic) => (
                    <option key={ic.value} value={ic.value}>
                      {ic.label}
                    </option>
                  ))}
                </Form.Select>
              </div>
            </Form.Group>
            <Form.Group className="tw:mb-4" controlId="area-new-assign">
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
                className="bg-dark tw:text-content border-secondary"
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
            <div className="tw:flex tw:flex-wrap tw:-mx-2 tw:*:w-full tw:*:px-2 tw:gap-y-4">
              <div className="tw:min-w-0 tw:flex-1">
                <Form.Group controlId="area-new-width">
                  <Form.Label>{m.admin_layout_area_width_m()}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0.1}
                    max={50}
                    step={0.5}
                    value={newArea.widthM}
                    onChange={(e) => setNewArea((p) => ({ ...p, widthM: Number(e.target.value) }))}
                    className="bg-dark tw:text-content border-secondary"
                  />
                </Form.Group>
              </div>
              <div className="tw:min-w-0 tw:flex-1">
                <Form.Group controlId="area-new-length">
                  <Form.Label>{m.admin_layout_area_length_m()}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0.1}
                    max={50}
                    step={0.5}
                    value={newArea.lengthM}
                    onChange={(e) => setNewArea((p) => ({ ...p, lengthM: Number(e.target.value) }))}
                    className="bg-dark tw:text-content border-secondary"
                  />
                </Form.Group>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddArea(false)}>
              {m.admin_action_cancel()}
            </Button>
            <Button variant="info" onClick={handleAddArea} disabled={!newArea.label.trim()}>
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Table Modal */}
      <Dialog
        open={showAddTable}
        onOpenChange={(open) => {
          if (!open) setShowAddTable(false);
        }}
      >
        <DialogContent admin size="default">
          <DialogHeader>
            <DialogTitle id="add-table-modal-title">{m.admin_add_table()}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {addTableError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="tw:py-1 tw:mb-4 tw:text-sm"
              >
                {addTableError}
              </Alert>
            )}
            <Form.Group className="tw:mb-4" controlId="table-name">
              <Form.Label>{m.admin_table_name()}</Form.Label>
              <Form.Control
                type="text"
                value={newTable.name}
                onChange={(e) => setNewTable((p) => ({ ...p, name: e.target.value }))}
                className="bg-dark tw:text-content border-secondary"
                placeholder={m.admin_table_name_placeholder()}
              />
            </Form.Group>
            <Form.Group className="tw:mb-4" controlId="table-type">
              <Form.Label>{m.admin_table_type_select()}</Form.Label>
              <Form.Select
                value={newTable.tableTypeId}
                onChange={(e) => setNewTable((p) => ({ ...p, tableTypeId: e.target.value }))}
                className="bg-dark tw:text-content border-secondary"
              >
                <option value="">— {m.admin_table_type_select()} —</option>
                {tableTypes
                  .filter((tt) => tt.venueId === activeRoom?.venueId)
                  .map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name} (
                      {tt.shape === "round" ? `⌀${tt.widthM}m` : `${tt.widthM}×${tt.lengthM}m`},{" "}
                      {tt.heightType === "high"
                        ? m.admin_table_height_type_high()
                        : m.admin_table_height_type_low()}
                      , {m.admin_layout_capacity_max()} {tt.capacity})
                    </option>
                  ))}
              </Form.Select>
            </Form.Group>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddTable(false)}>
              {m.admin_action_cancel()}
            </Button>
            <Button
              variant="warning"
              onClick={handleAddTable}
              disabled={!newTable.name.trim() || !newTable.tableTypeId}
            >
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDeleteLayoutId && (
        <ConfirmModal
          admin
          show
          title={m.admin_layout_delete_title()}
          body={m.admin_layout_delete_confirm()}
          errorFallback={m.admin_error_delete_layout()}
          onConfirm={() => handleDeleteLayout(confirmDeleteLayoutId)}
          onHide={() => setConfirmDeleteLayoutId(null)}
        />
      )}
      {confirmDeleteTableId && (
        <ConfirmModal
          admin
          show
          title={m.admin_layout_table_delete_title()}
          body={m.admin_layout_table_delete_confirm()}
          errorFallback={m.admin_content_error_save()}
          onConfirm={() => handleDeleteTable(confirmDeleteTableId)}
          onHide={() => setConfirmDeleteTableId(null)}
        />
      )}
      {confirmDeleteAreaId && (
        <ConfirmModal
          admin
          show
          title={m.admin_layout_area_delete_title()}
          body={m.admin_layout_area_delete_confirm()}
          errorFallback={m.admin_content_error_save()}
          onConfirm={() => handleDeleteArea(confirmDeleteAreaId)}
          onHide={() => setConfirmDeleteAreaId(null)}
        />
      )}
      <LayoutCompareModal
        show={showCompareLayouts}
        onHide={() => setShowCompareLayouts(false)}
        roomLayouts={roomLayouts}
        tables={tables}
        areas={areas}
        tableTypes={tableTypes}
        dayOptions={dayOptions}
      />
      {activeLayoutId && (
        <LayoutRevisionsModal
          show={showRevisions}
          onHide={() => setShowRevisions(false)}
          layoutId={activeLayoutId}
          authHeaders={authHeaders}
          onSaveRevision={onSaveRevision}
          onRestoreRevision={onRestoreRevision}
        />
      )}
    </div>
  );
}

import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminOptionGroup,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import type { Registration } from "@/types/registration";
import type { TableAllocation } from "@/types/registration";
import type { Room, FloorTable, FloorArea, TableType, Layout, LayoutRevision } from "@/types/admin";
import { getAreaSizePx, getCanvasSizePx, getTableSizePx, safeRoomColor } from "@/utils/layoutUtils";
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
      ? "border-destructive"
      : isFull
        ? "border-warning"
        : assignedCount > 0
          ? "border-success"
          : "border-subtle";
  const bgCls = isSelected
    ? "bg-warning/25 text-highlight"
    : isOverfilled
      ? "bg-destructive/10 text-destructive"
      : isFull
        ? "bg-warning/10 text-highlight"
        : assignedCount > 0
          ? "bg-success/10 text-success"
          : "bg-muted text-subtle";

  return (
    <div
      ref={ref}
      onClick={(e) => {
        if (!isInteractive) return;
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "absolute flex flex-col items-center justify-center border text-center",
        shape === "round" ? "rounded-full" : "rounded-md",
        borderCls,
        bgCls,
      )}

      /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
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
      /* oxlint-enable shadcn/no-inline-styles */
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
      <Icon icon={UsersIcon} className="text-xl" />
      <span className="text-sm font-semibold text-tiny">{table.name}</span>
      <span className="text-micro">
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
  const bgCls = isSelected ? "bg-warning/25 text-highlight" : "bg-info/10 text-info";
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
        "absolute flex flex-col items-center justify-center rounded-md border text-center",
        borderCls,
        bgCls,
      )}

      /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
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
      /* oxlint-enable shadcn/no-inline-styles */
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
      <AreaIcon name={area.icon} className="text-xs" />
      <span className="font-semibold truncate w-full text-center px-1 text-micro">
        {area.label}
      </span>
      {assignedLabel && (
        <span
          className="truncate w-full text-center px-1 text-plan opacity-85"

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
    <div className="overflow-auto pb-2">
      <p className="text-subtle text-sm mb-1">
        {room.widthM} m × {room.lengthM} m
        <span className="ms-2">
          <Icon icon={InfoIcon} className="me-1" />
          {m.admin_table_move_hint()}
        </span>
      </p>
      <p className="sr-only">{m.admin_layout_keyboard_hint()}</p>
      <DragDropProvider sensors={SENSORS} modifiers={modifiers} onDragEnd={handleDragEnd}>
        <div
          ref={canvasRef}
          onClick={() => {
            onSelectTable(null);
            onSelectArea(null);
          }}
          className="relative rounded-md border"

          /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
          style={{
            width: canvasW,
            height: canvasH,
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
              <Icon icon={Grid3X3Icon} className="text-5xl" />
              <p className="mt-2 text-sm">{m.admin_no_tables()}</p>
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
      <Card tone="secondary" className="mb-4">
        <CardHeader className="flex items-center justify-between flex-wrap gap-2">
          {activeLayoutDateLabel && (
            <span className="text-subtle text-sm hidden site-md:inline">
              <Icon icon={CalendarIcon} className="me-1" />
              {activeLayoutDateLabel}
            </span>
          )}
          <div className="flex flex-wrap gap-1" role="group" aria-label={m.admin_rooms_tab()}>
            {rooms.map((room) => {
              const roomTableCount = layouts
                .filter((l) => l.roomId === room.id)
                .reduce((sum, l) => sum + tables.filter((t) => t.layoutId === l.id).length, 0);
              return (
                <span key={room.id}>
                  <Button
                    size="sm"
                    variant={activeRoomId === room.id ? "default" : "ghost"}
                    aria-pressed={activeRoomId === room.id}
                    onClick={() => handleSelectRoom(room.id)}
                  >
                    <span
                      className="mr-1 inline-block size-2.5 rounded-full"

                      /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
                      style={{
                        background: safeRoomColor(room.color),
                      }}
                      /* oxlint-enable shadcn/no-inline-styles */
                      aria-hidden="true"
                    />
                    {room.name}
                    <span className="ml-1 rounded bg-muted px-1 text-xs text-muted-foreground">
                      {roomTableCount}
                    </span>
                  </Button>
                </span>
              );
            })}
          </div>
          <div className="flex gap-2 items-center">
            <ButtonGroup aria-label={m.admin_layout_layer_aria()}>
              <Button
                variant={layer === "seating" ? "warning" : "outline"}
                aria-pressed={layer === "seating"}
                size="sm"
                onClick={() => {
                  setLayer("seating");
                  setSelectedArea(null);
                }}
              >
                <Icon icon={UsersIcon} />
                {m.admin_layout_seating()}
              </Button>
              <Button
                variant={layer === "areas" ? "info" : "outline"}
                aria-pressed={layer === "areas"}
                size="sm"
                onClick={() => {
                  setLayer("areas");
                  setSelectedTable(null);
                }}
              >
                <Icon icon={StoreIcon} />
                {m.admin_layout_areas()}
              </Button>
            </ButtonGroup>
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
                <Icon icon={PlusIcon} />
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
                <Icon icon={PlusIcon} />
                {m.admin_layout_add_area()}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-2">
          {rooms.length === 0 ? (
            <p className="text-subtle text-center text-sm mb-0">
              <Icon icon={InfoIcon} className="me-1" />
              {m.admin_room_no_rooms()}
            </p>
          ) : activeRoom ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="font-semibold" /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
                    style={{ color: safeRoomColor(activeRoom.color, "inherit") }}
                    /* oxlint-enable shadcn/no-inline-styles */
                  >
                    <Icon icon={BuildingIcon} className="me-1" />
                    {activeRoom.name}
                  </span>
                  {/* Day / layout selector */}
                  <div className="flex flex-wrap gap-1 items-center">
                    {roomLayouts.map((layout) => (
                      <div key={layout.id} className="flex items-center gap-0">
                        <Button
                          size="sm"
                          variant={activeLayoutId === layout.id ? "warning" : "outline"}
                          onClick={() => {
                            setActiveLayoutId(layout.id);
                            setSelectedTable(null);
                          }}
                          className="rounded-tr-none rounded-br-none"
                        >
                          {getDayLabel(layout, dayOptions)}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => setConfirmDeleteLayoutId(layout.id)}
                          title={m.admin_delete()}
                          aria-label={m.admin_delete()}
                          className="rounded-tl-none rounded-bl-none border-l-0"
                        >
                          <Icon icon={XIcon} />
                        </Button>
                      </div>
                    ))}
                    {roomLayouts.length === 0 && (
                      <span className="text-subtle text-sm">{m.admin_no_layouts()}</span>
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
                      <Icon icon={PlusIcon} />
                      {m.admin_add_layout()}
                    </Button>
                    {roomLayouts.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline-info"
                        onClick={() => setShowCompareLayouts(true)}
                        title={m.admin_layout_compare_title()}
                      >
                        <Icon icon={ArrowLeftRightIcon} />
                        {m.admin_layout_compare_title()}
                      </Button>
                    )}
                    {activeLayoutId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowRevisions(true)}
                        title={m.admin_layout_revisions_button()}
                      >
                        <Icon icon={HistoryIcon} />
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
                <p className="text-subtle text-center text-sm py-6 mb-0">{m.admin_no_layouts()}</p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Selected table detail */}
      {selectedTableData && (
        <Card tone="warning" className="mb-4">
          <CardHeader className="flex items-center justify-between border-warning">
            <span className="font-semibold">
              <Icon icon={TableIcon} className="me-2" />
              {m.admin_table_label()}: {selectedTableData.name}
            </span>
            <div className="flex gap-2 items-center">
              <Badge variant="secondary">
                {selectedTableData.capacity} {m.admin_guests_count()}
              </Badge>
              {selectedType && (
                <Badge variant="secondary" className="text-content">
                  {selectedType.name}
                </Badge>
              )}
              {selectedType && (
                <Badge
                  variant={selectedType.heightType === "high" ? "info" : "dark"}
                  className="border border-subtle"
                >
                  {selectedType.heightType === "high"
                    ? m.admin_table_height_type_high()
                    : m.admin_table_height_type_low()}
                </Badge>
              )}
              {selectedType?.shape !== "round" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onRotateTable(selectedTableData.id, selectedTableData.rotation - 15)
                    }
                    title={m.admin_layout_rotate_ccw()}
                    aria-label={m.admin_layout_rotate_ccw()}
                  >
                    <Icon icon={RotateCcwIcon} />
                  </Button>
                  <span className="text-subtle text-sm min-w-14 text-center">
                    {Math.round(selectedTableData.rotation)}°
                  </span>
                  <Button
                    variant="outline"
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
          </CardHeader>
          <CardContent>
            {updateTableError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="py-1 mb-2 text-sm"
              >
                {updateTableError}
              </Alert>
            )}
            {allocationError && (
              <Alert role="alert" variant="danger" className="py-1 mb-2 text-sm">
                {allocationError}
              </Alert>
            )}
            <AdminField className="mb-4" controlId="table-name-edit">
              <AdminLabel className="text-subtle text-sm">{m.admin_table_name()}</AdminLabel>
              <AdminInput
                size="sm"
                type="text"
                className="bg-muted text-content border-input"
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
            </AdminField>
            <AdminField className="mb-4" controlId="table-type-select">
              <AdminLabel className="text-subtle text-sm">
                {m.admin_layout_table_type_label()}
              </AdminLabel>
              <AdminSelect
                size="sm"
                className="bg-muted text-content border-input"
                value={selectedTableData.tableTypeId}
                onValueChange={async (e) => {
                  setUpdateTableError(null);
                  try {
                    await onChangeTableType(selectedTableData.id, e);
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
                    <AdminOption key={tt.id} value={tt.id} disabled={!tt.active}>
                      {tt.name}
                    </AdminOption>
                  ))}
              </AdminSelect>
            </AdminField>
            {selectedRegistrations.length === 0 ? (
              <p className="text-subtle mb-0">{m.admin_unassigned()}</p>
            ) : (
              <PresentationList flush className="mb-4">
                {selectedRegistrations.map((r) => (
                  <PresentationListItem key={r.id} className="border-border">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold me-auto">{r.person.name}</span>
                      {(() => {
                        const allocation = r.allocations?.find(
                          (item) => item.tableId === selectedTableData.id,
                        );
                        if (!allocation) return null;
                        return (
                          <>
                            <AdminInput
                              aria-label={`${m.admin_guests_count()} ${r.person.name}`}
                              type="number"
                              min={allocation.exclusive ? 0 : 1}
                              max={20}
                              defaultValue={allocation.guestCount}
                              disabled={allocationPending || allocation.exclusive}
                              className="bg-muted text-content border-input w-20"

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
                            <AdminSelect
                              aria-label={`${m.admin_layout_move_booking()} ${r.person.name}`}
                              size="sm"
                              value={selectedTableData.id}
                              disabled={allocationPending}
                              onValueChange={(event) =>
                                void savePlanAllocations(
                                  r,
                                  (r.allocations ?? []).map((item) =>
                                    item.tableId === selectedTableData.id
                                      ? { ...item, tableId: event }
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
                                  <AdminOption key={table.id} value={table.id}>
                                    {table.name}
                                  </AdminOption>
                                ))}
                            </AdminSelect>
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
                  </PresentationListItem>
                ))}
              </PresentationList>
            )}
            <div className="border-t border-subtle pt-4 mt-4">
              <AdminLabel className="text-subtle text-sm">
                {m.admin_layout_assign_booking()}
              </AdminLabel>
              <div className="flex flex-wrap gap-2">
                <AdminSelect
                  aria-label={m.admin_layout_assign_booking()}
                  value={bookingToAssign}
                  disabled={allocationPending || assignableRegistrations.length === 0}
                  onValueChange={(event) => {
                    const id = event;
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
                  <AdminOption value="">{m.admin_layout_choose_booking()}</AdminOption>
                  {assignableRegistrations.map((registration) => (
                    <AdminOption key={registration.id} value={registration.id}>
                      {registration.person.name} · {registration.id}
                    </AdminOption>
                  ))}
                </AdminSelect>
                <AdminInput
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
                  className="w-24"
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
          </CardContent>
        </Card>
      )}

      {/* Selected area detail */}
      {selectedAreaData && (
        <Card tone="info" className="mb-4">
          <CardHeader className="flex items-center justify-between border-info">
            <span className="font-semibold">
              <AreaIcon name={selectedAreaData.icon} className="me-2" />
              {m.admin_layout_area_label_prefix()} {selectedAreaData.label}
            </span>
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRotateArea(selectedAreaData.id, selectedAreaData.rotation - 15)}
                title={m.admin_layout_rotate_ccw()}
                aria-label={m.admin_layout_rotate_ccw()}
              >
                <Icon icon={RotateCcwIcon} />
              </Button>
              <span className="text-subtle text-sm min-w-14 text-center">
                {Math.round(selectedAreaData.rotation)}°
              </span>
              <Button
                variant="outline"
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
          </CardHeader>
          <CardContent>
            {assignAreaError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="py-1 mb-2 text-sm"
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
                className="py-1 mb-2 text-sm"
                onClose={() => setResizeAreaError(null)}
              >
                {resizeAreaError}
              </Alert>
            )}
            <AdminField className="mb-4" controlId="area-label">
              <AdminLabel className="text-subtle text-sm">
                {m.admin_layout_area_form_label()}
              </AdminLabel>
              <AdminInput
                size="sm"
                type="text"
                className="bg-muted text-content border-input"
                defaultValue={selectedAreaData.label}
                onBlur={(e) => {
                  const newLabel = e.target.value.trim();
                  if (newLabel && newLabel !== selectedAreaData.label) {
                    onUpdateAreaLabel(selectedAreaData.id, newLabel);
                  }
                }}
                key={selectedAreaData.id}
              />
            </AdminField>
            <div className="flex gap-2 mb-4">
              <AdminField controlId="area-width" className="flex-1">
                <AdminLabel className="text-subtle text-sm">
                  {m.admin_layout_area_width_m()}
                </AdminLabel>
                <AdminInput
                  size="sm"
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.1}
                  className="bg-muted text-content border-input"
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
              </AdminField>
              <AdminField controlId="area-length" className="flex-1">
                <AdminLabel className="text-subtle text-sm">
                  {m.admin_layout_area_length_m()}
                </AdminLabel>
                <AdminInput
                  size="sm"
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.1}
                  className="bg-muted text-content border-input"
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
              </AdminField>
            </div>
            <AdminField className="mb-4" controlId="area-icon">
              <AdminLabel className="text-subtle text-sm">
                {m.admin_layout_area_form_icon()}
              </AdminLabel>
              <div className="flex gap-2 items-center">
                <AreaIcon name={selectedAreaData.icon} className="text-primary" />
                <AdminSelect
                  size="sm"
                  className="bg-muted text-content border-input"
                  value={selectedAreaData.icon || "bi-shop"}
                  onValueChange={async (e) => {
                    const newIcon = e;
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
                    <AdminOption key={ic.value} value={ic.value}>
                      {ic.label}
                    </AdminOption>
                  ))}
                </AdminSelect>
              </div>
            </AdminField>
            <AdminField controlId="area-assign-item">
              <AdminLabel className="text-subtle text-sm">
                {m.admin_layout_area_assigned_to()}
              </AdminLabel>
              <AdminSelect
                size="sm"
                className="bg-muted text-content border-input"
                value={selectedAreaData.exhibitorId ? `e:${selectedAreaData.exhibitorId}` : ""}
                onValueChange={async (ev) => {
                  const val = ev;
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
                <AdminOption value="">{m.admin_layout_area_none()}</AdminOption>
                {exhibitors.filter((e) => e.active).length > 0 && (
                  <AdminOptionGroup label={m.admin_layout_area_exhibitors_group()}>
                    {exhibitors
                      .filter((e) => e.active)
                      .map((e) => (
                        <AdminOption key={e.id} value={`e:${e.id}`}>
                          {e.name}
                        </AdminOption>
                      ))}
                  </AdminOptionGroup>
                )}
              </AdminSelect>
            </AdminField>
            {tablesInSelectedArea.length > 0 && (
              <div className="mt-4 pt-4 border-t border-subtle">
                <p className="text-subtle text-sm mb-2">
                  <Icon icon={Grid3X3Icon} className="me-1" />
                  {m.admin_layout_tables_in_stand()}{" "}
                  <Badge variant="info">{tablesInSelectedArea.length}</Badge>
                  <span className="ms-2 text-subtle">
                    {tablesInSelectedArea.reduce((s, t) => s + t.capacity, 0)}{" "}
                    {m.admin_layout_places_total()}
                  </span>
                </p>
                <PresentationList flush>
                  {tablesInSelectedArea.map((t) => (
                    <PresentationListItem key={t.id} className="py-1 px-2 text-sm">
                      <Icon icon={Grid3X3Icon} className="me-1 text-muted-foreground" />
                      {t.name}
                      <Badge variant="secondary" className="ms-2 text-micro">
                        {t.capacity} {m.admin_layout_capacity_abbrev()}
                      </Badge>
                    </PresentationListItem>
                  ))}
                </PresentationList>
              </div>
            )}
          </CardContent>
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
                className="py-1 mb-4 text-sm"
              >
                {addLayoutError}
              </Alert>
            )}
            <AdminField className="mb-4" controlId="layout-day">
              <AdminLabel>{m.admin_layout_day_label()}</AdminLabel>
              <AdminSelect
                value={newLayout.eventId}
                onValueChange={(e) => setNewLayout((p) => ({ ...p, eventId: e }))}
                className="bg-muted text-content border-input"
              >
                {dayOptions.map((day) => (
                  <AdminOption key={day.eventId} value={day.eventId}>
                    {day.label}
                  </AdminOption>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField controlId="layout-copy-from">
              <AdminLabel>{m.admin_layout_copy_from_label()}</AdminLabel>
              <AdminSelect
                value={newLayout.copyFromLayoutId}
                onValueChange={(e) => setNewLayout((p) => ({ ...p, copyFromLayoutId: e }))}
                className="bg-muted text-content border-input"
              >
                <AdminOption value="">{m.admin_layout_copy_from_empty()}</AdminOption>
                {roomLayouts.map((layout) => (
                  <AdminOption key={layout.id} value={layout.id}>
                    {getDayLabel(layout, dayOptions)}
                  </AdminOption>
                ))}
              </AdminSelect>
            </AdminField>
            {newLayout.copyFromLayoutId && (
              <div className="mt-4 flex flex-col gap-2">
                <AdminCheck
                  id="layout-copy-tables"
                  type="checkbox"
                  className="text-sm"
                  checked={newLayout.copyTables}
                  onCheckedChange={(e) => setNewLayout((p) => ({ ...p, copyTables: e }))}
                  label={m.admin_layout_copy_tables()}
                />
                <AdminCheck
                  id="layout-copy-areas"
                  type="checkbox"
                  className="text-sm"
                  checked={newLayout.copyAreas}
                  onCheckedChange={(e) =>
                    setNewLayout((p) => ({
                      ...p,
                      copyAreas: e,
                    }))
                  }
                  label={m.admin_layout_copy_areas()}
                />
                {newLayout.copyAreas && (
                  <div className="text-subtle text-sm">{m.admin_layout_copy_areas_hint()}</div>
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
                className="py-1 mb-4 text-sm"
              >
                {addAreaError}
              </Alert>
            )}
            <AdminField className="mb-4" controlId="area-new-label">
              <AdminLabel>{m.admin_layout_area_form_label()}</AdminLabel>
              <AdminInput
                type="text"
                value={newArea.label}
                onChange={(e) => setNewArea((p) => ({ ...p, label: e.target.value }))}
                className="bg-muted text-content border-input"
                placeholder={m.admin_layout_area_label_placeholder()}
              />
            </AdminField>
            <AdminField className="mb-4" controlId="area-new-icon">
              <AdminLabel>{m.admin_layout_area_form_icon()}</AdminLabel>
              <div className="flex gap-2 items-center">
                <AreaIcon name={newArea.icon} className="text-2xl text-primary" />
                <AdminSelect
                  value={newArea.icon}
                  onValueChange={(e) => setNewArea((p) => ({ ...p, icon: e }))}
                  className="bg-muted text-content border-input"
                >
                  {getAreaIcons().map((ic) => (
                    <AdminOption key={ic.value} value={ic.value}>
                      {ic.label}
                    </AdminOption>
                  ))}
                </AdminSelect>
              </div>
            </AdminField>
            <AdminField className="mb-4" controlId="area-new-assign">
              <AdminLabel>{m.admin_layout_area_assigned_to_optional()}</AdminLabel>
              <AdminSelect
                value={newArea.assignedType ? `${newArea.assignedType}:${newArea.assignedId}` : ""}
                onValueChange={(e) => {
                  const val = e;
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
                className="bg-muted text-content border-input"
              >
                <AdminOption value="">{m.admin_layout_area_none()}</AdminOption>
                {exhibitors.filter((e) => e.active).length > 0 && (
                  <AdminOptionGroup label={m.admin_layout_area_exhibitors_group()}>
                    {exhibitors
                      .filter((e) => e.active)
                      .map((e) => (
                        <AdminOption key={e.id} value={`e:${e.id}`}>
                          {e.name}
                        </AdminOption>
                      ))}
                  </AdminOptionGroup>
                )}
              </AdminSelect>
            </AdminField>
            <div className="flex flex-wrap -mx-2 *:w-full *:px-2 gap-y-4">
              <div className="min-w-0 flex-1">
                <AdminField controlId="area-new-width">
                  <AdminLabel>{m.admin_layout_area_width_m()}</AdminLabel>
                  <AdminInput
                    type="number"
                    min={0.1}
                    max={50}
                    step={0.5}
                    value={newArea.widthM}
                    onChange={(e) => setNewArea((p) => ({ ...p, widthM: Number(e.target.value) }))}
                    className="bg-muted text-content border-input"
                  />
                </AdminField>
              </div>
              <div className="min-w-0 flex-1">
                <AdminField controlId="area-new-length">
                  <AdminLabel>{m.admin_layout_area_length_m()}</AdminLabel>
                  <AdminInput
                    type="number"
                    min={0.1}
                    max={50}
                    step={0.5}
                    value={newArea.lengthM}
                    onChange={(e) => setNewArea((p) => ({ ...p, lengthM: Number(e.target.value) }))}
                    className="bg-muted text-content border-input"
                  />
                </AdminField>
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
                className="py-1 mb-4 text-sm"
              >
                {addTableError}
              </Alert>
            )}
            <AdminField className="mb-4" controlId="table-name">
              <AdminLabel>{m.admin_table_name()}</AdminLabel>
              <AdminInput
                type="text"
                value={newTable.name}
                onChange={(e) => setNewTable((p) => ({ ...p, name: e.target.value }))}
                className="bg-muted text-content border-input"
                placeholder={m.admin_table_name_placeholder()}
              />
            </AdminField>
            <AdminField className="mb-4" controlId="table-type">
              <AdminLabel>{m.admin_table_type_select()}</AdminLabel>
              <AdminSelect
                value={newTable.tableTypeId}
                onValueChange={(e) => setNewTable((p) => ({ ...p, tableTypeId: e }))}
                className="bg-muted text-content border-input"
              >
                <AdminOption value="">— {m.admin_table_type_select()} —</AdminOption>
                {tableTypes
                  .filter((tt) => tt.venueId === activeRoom?.venueId)
                  .map((tt) => (
                    <AdminOption key={tt.id} value={tt.id}>
                      {tt.name} (
                      {tt.shape === "round" ? `⌀${tt.widthM}m` : `${tt.widthM}×${tt.lengthM}m`},{" "}
                      {tt.heightType === "high"
                        ? m.admin_table_height_type_high()
                        : m.admin_table_height_type_low()}
                      , {m.admin_layout_capacity_max()} {tt.capacity})
                    </AdminOption>
                  ))}
              </AdminSelect>
            </AdminField>
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

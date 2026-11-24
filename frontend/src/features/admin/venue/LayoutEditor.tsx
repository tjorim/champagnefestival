import { useAdminWorkspace } from "../shell/AdminWorkspace";
import { useAdminDashboardData } from "../shell/useAdminDashboardData";
import { useWorkspaceRegistrationActions } from "../registrations/useWorkspaceRegistrationActions";
import { useAdminVenueActions } from "../shell/useAdminVenueActions";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSelect, AdminOption } from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ArrowLeftRightIcon,
  MaximizeIcon,
  MinimizeIcon,
  InfoIcon,
  RotateCcwClockIcon,
  StoreIcon,
  TrashIcon,
  UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { useQuery } from "@tanstack/react-query";
import { fetchAllRegistrationPages } from "@/lib/api/adminFetch";
import { queryKeys } from "@/lib/query/queryKeys";
import { withTableOccupancy } from "@/lib/collections/tableOccupancy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Registration } from "@/types/registration";
import type {
  Room,
  FloorTable,
  TableAllocation,
  FloorArea,
  TableType,
  Layout,
  LayoutRevision,
} from "@/api-types";
import { getCanvasSizePx } from "@/lib/venue/layoutUtils";
import { getTablesInArea } from "./layoutGeometry";
import { devError } from "@/lib/devLog";
import LayoutCompareModal from "./LayoutCompareModal";
import LayoutRevisionsModal from "./LayoutRevisionsModal";
import { AdminAddButton } from "@/components/admin/RowActions";
import ConfirmModal from "@/components/ConfirmModal";
import { getDayLabel, getInitialNewLayoutState, type DayOption } from "./layout/layoutDays";
import { type ItemRef } from "./layout/layoutTypes";
import { TableLocator } from "./layout/TableLocator";
import { RoomCanvas } from "./layout/RoomCanvas";
import { AddLayoutDialog } from "./layout/AddLayoutDialog";
import { AddAreaDialog } from "./layout/AddAreaDialog";
import { AddTableDialog } from "./layout/AddTableDialog";
import { TableInspectorCard } from "./layout/TableInspectorCard";
import { AreaInspectorCard } from "./layout/AreaInspectorCard";
import { useTableInspectorState } from "./layout/useTableInspectorState";

/**
 * LayoutEditor — multi-room floor plan manager.
 *
 * Uses @dnd-kit/react for accessible, reliable drag-and-drop positioning
 * of tables within rooms.  Each room is rendered as a proportional canvas
 * (1 metre = PX_PER_M pixels). The canvas, inspector cards and add dialogs live in `./layout/`;
 * this module keeps the selection, form state and handlers they share.
 */

interface LayoutEditorProps {
  dayOptions: DayOption[];
  tables: FloorTable[];
  tableTypes: TableType[];
  layouts: Layout[];
  registrations: Registration[];
  rooms: Room[];
  organizations: ItemRef[];
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
    organizationId?: number,
  ) => Promise<void>;
  onMoveArea: (areaId: string, x: number, y: number) => void;
  onDeleteArea: (areaId: string) => Promise<void>;
  onRotateArea: (areaId: string, rotation: number) => void;
  onAssignAreaToItem: (
    areaId: string,
    organizationId: number | null,
    label?: string,
    icon?: string,
  ) => Promise<void>;
  onUpdateAreaLabel: (areaId: string, label: string) => void;
  onChangeTableType: (tableId: string, tableTypeId: string) => Promise<void>;
  onUpdateTable: (tableId: string, name: string) => Promise<void>;
  onResizeArea: (areaId: string, widthM: number, lengthM: number) => Promise<void>;
  onSaveAllocations: (registrationId: string, allocations: TableAllocation[]) => Promise<void>;

  onSaveRevision: (layoutId: string, label: string, changeNote?: string) => Promise<LayoutRevision>;
  onRestoreRevision: (
    layoutId: string,
    revisionNumber: number,
    resolveAllocations?: boolean,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// LayoutEditor (main export)
// ---------------------------------------------------------------------------

export function LayoutEditorView({
  dayOptions,
  tables: suppliedTables,
  tableTypes,
  layouts,
  registrations: suppliedRegistrations,
  rooms,
  organizations,
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

  onSaveRevision,
  onRestoreRevision,
}: LayoutEditorProps) {
  const [fitPlan, setFitPlan] = useState(true);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [showCompareLayouts, setShowCompareLayouts] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [layer, setLayer] = useState<"seating" | "areas">("seating");
  useEffect(() => {
    const inspector = inspectorRef.current;
    if (!inspector || (!selectedTable && !selectedArea)) return;
    inspector.scrollTop = 0;
    if (window.matchMedia("(max-width: 1199px), (max-height: 599px)").matches) {
      inspector.scrollIntoView?.({ block: "nearest" });
    }
  }, [selectedTable, selectedArea]);

  const activeLayout = layouts.find((layout) => layout.id === activeLayoutId);
  const historicalEventId =
    activeLayout && !dayOptions.some((day) => day.eventId === activeLayout.event_id)
      ? activeLayout.event_id
      : undefined;
  const historicalRegistrations = useQuery({
    queryKey: [...queryKeys.admin.registrations, "layout-event", historicalEventId],
    queryFn: ({ signal }) => fetchAllRegistrationPages({ eventId: historicalEventId, signal }),
    enabled: Boolean(historicalEventId),
    gcTime: 0,
    staleTime: 15 * 1000,
    retry: false,
  });
  const registrations = useMemo(
    () => (historicalEventId ? (historicalRegistrations.data ?? []) : suppliedRegistrations),
    [historicalEventId, historicalRegistrations.data, suppliedRegistrations],
  );
  const tables = useMemo(
    () => (historicalEventId ? withTableOccupancy(suppliedTables, registrations) : suppliedTables),
    [historicalEventId, suppliedTables, registrations],
  );

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
    const roomLayouts = layouts.filter((l) => l.room_id === activeRoomId);
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
      setAddLayoutError(apiErrorMessage(err, m.admin_error_add_layout()));
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
  const tableInspector = useTableInspectorState(onSaveAllocations);
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
      setAddTableError(apiErrorMessage(err, m.admin_content_error_save()));
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
      const organizationId = newArea.assignedType === "e" ? newArea.assignedId : undefined;
      await onAddArea(
        newArea.label.trim(),
        newArea.icon || "bi-shop",
        activeLayoutId,
        newArea.widthM,
        newArea.lengthM,
        organizationId,
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
      setAddAreaError(apiErrorMessage(err, m.admin_content_error_save()));
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
  const activeRoom = rooms.find((r) => r.id === (activeLayout?.room_id ?? activeRoomId));
  const roomLayouts = layouts
    .filter((l) => l.room_id === activeRoomId)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const canvasTables = activeLayoutId ? tables.filter((t) => t.layout_id === activeLayoutId) : [];
  const canvasAreas = activeLayoutId ? areas.filter((a) => a.layout_id === activeLayoutId) : [];

  const selectedAreaData = canvasAreas.find((a) => a.id === selectedArea);

  const areaCanvas = activeRoom ? getCanvasSizePx(activeRoom.width_m, activeRoom.length_m) : null;
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
    !tableTypes.some((tt) => tt.id === newTable.tableTypeId && tt.venue_id === activeRoom?.venue_id)
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

  if (historicalEventId && !historicalRegistrations.data) {
    return (
      <p role="status">
        {historicalRegistrations.isError
          ? m.admin_error_load_data()
          : m.admin_search_person_placeholder()}
      </p>
    );
  }

  return (
    <div>
      {activeRoom && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <AdminSelect
            aria-label={m.admin_rooms_tab()}
            size="sm"
            className="w-32 grow max-w-48"
            value={activeRoomId ?? ""}
            onValueChange={handleSelectRoom}
          >
            {rooms.map((room) => {
              const layoutIds = new Set(
                layouts.filter((layout) => layout.room_id === room.id).map((layout) => layout.id),
              );
              const count = tables.filter((table) => layoutIds.has(table.layout_id)).length;
              return (
                <AdminOption key={room.id} value={room.id}>
                  {`${room.name} · ${m.admin_layout_all_layouts_count({ count })}`}
                </AdminOption>
              );
            })}
          </AdminSelect>
          {roomLayouts.length > 0 && (
            <AdminSelect
              aria-label={m.admin_layout_day_label()}
              size="sm"
              className="w-32 grow max-w-48"
              value={activeLayoutId ?? ""}
              onValueChange={(id) => {
                setActiveLayoutId(id);
                setSelectedTable(null);
                setSelectedArea(null);
              }}
            >
              {roomLayouts.map((layout) => (
                <AdminOption key={layout.id} value={layout.id}>
                  {getDayLabel(layout, dayOptions)}
                </AdminOption>
              ))}
            </AdminSelect>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              variant="outline"
              size="sm"
              className="text-foreground"
              aria-label={m.admin_layout_layer_aria()}
              value={[layer]}
              onValueChange={(values) => {
                if (values[0] === "seating") {
                  setLayer("seating");
                  setSelectedArea(null);
                } else if (values[0] === "areas") {
                  setLayer("areas");
                  setSelectedTable(null);
                }
              }}
            >
              <ToggleGroupItem value="seating">
                <Icon icon={UsersIcon} />
                {m.admin_layout_seating()}
              </ToggleGroupItem>
              <ToggleGroupItem value="areas">
                <Icon icon={StoreIcon} />
                {m.admin_layout_areas()}
              </ToggleGroupItem>
            </ToggleGroup>
            {layer === "seating" ? (
              <AdminAddButton
                onClick={() => {
                  setAddTableError(null);
                  setShowAddTable(true);
                }}
                disabled={!activeLayoutId}
              >
                {m.admin_add_table()}
              </AdminAddButton>
            ) : (
              <AdminAddButton
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
                {m.admin_layout_add_area()}
              </AdminAddButton>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <AdminAddButton
              variant="outline"
              onClick={() => {
                setAddLayoutError(null);
                setNewLayout(getInitialNewLayoutState(dayOptions));
                setShowAddLayout(true);
              }}
            >
              {m.admin_add_layout()}
            </AdminAddButton>
            {roomLayouts.length > 1 && (
              <Button
                size="icon-sm"
                variant="outline-info"
                onClick={() => setShowCompareLayouts(true)}
                title={m.admin_layout_compare_title()}
                aria-label={m.admin_layout_compare_title()}
              >
                <Icon icon={ArrowLeftRightIcon} />
              </Button>
            )}
            {activeLayout && (
              <>
                <Button size="sm" variant="outline" onClick={() => setFitPlan((fit) => !fit)}>
                  <Icon icon={fitPlan ? MaximizeIcon : MinimizeIcon} />
                  {fitPlan ? m.admin_layout_actual_size() : m.admin_layout_fit_plan()}
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setShowRevisions(true)}
                  title={m.admin_layout_revisions_button()}
                  aria-label={m.admin_layout_revisions_button()}
                >
                  <Icon icon={RotateCcwClockIcon} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline-danger"
                  onClick={() => setConfirmDeleteLayoutId(activeLayout.id)}
                  title={m.admin_delete_item({ name: getDayLabel(activeLayout, dayOptions) })}
                  aria-label={m.admin_delete_item({ name: getDayLabel(activeLayout, dayOptions) })}
                >
                  <Icon icon={TrashIcon} />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="admin-plan-workspace">
        <Card tone="secondary" className="min-w-0 mb-4">
          <CardContent className="p-2">
            {rooms.length === 0 ? (
              <AdminEmptyState>
                <Icon icon={InfoIcon} className="me-1" />
                {m.admin_floor_plan_no_rooms({ section: m.admin_venues_rooms_tab() })}
              </AdminEmptyState>
            ) : activeRoom ? (
              activeLayoutId ? (
                <RoomCanvas
                  fitPlan={fitPlan}
                  room={activeRoom}
                  roomTables={canvasTables}
                  roomAreas={canvasAreas}
                  tableTypes={tableTypes}
                  registrations={registrations}
                  organizations={organizations}
                  layer={layer}
                  selectedTable={selectedTable}
                  selectedArea={selectedArea}
                  onSelectTable={setSelectedTable}
                  onSelectArea={setSelectedArea}
                  onMoveTable={onMoveTable}
                  onMoveArea={onMoveArea}
                />
              ) : (
                <AdminEmptyState>{m.admin_no_layouts()}</AdminEmptyState>
              )
            ) : null}
          </CardContent>
        </Card>

        <aside
          ref={inspectorRef}
          className="admin-plan-inspector text-content"
          aria-label={m.admin_layout_inspector()}
        >
          <h2 className="text-lg font-semibold mb-2">{m.admin_layout_inspector()}</h2>
          <p className="text-sm text-subtle mb-3">{m.admin_layout_save_behaviour()}</p>
          {activeLayoutId && (
            <TableLocator
              tables={canvasTables}
              selectedTable={selectedTable}
              onSelect={(tableId) => {
                setSelectedTable(tableId);
                setSelectedArea(null);
                setLayer("seating");
              }}
            />
          )}
          {!selectedTableData && !selectedAreaData && (
            <AdminEmptyState>{m.admin_layout_select_object()}</AdminEmptyState>
          )}
          {selectedTableData && (
            <TableInspectorCard
              table={selectedTableData}
              tableTypes={tableTypes}
              venueId={activeRoom?.venue_id}
              layouts={layouts}
              tables={tables}
              registrations={registrations}
              activeLayout={activeLayout}
              inspector={tableInspector}
              onRotateTable={onRotateTable}
              onUpdateTable={onUpdateTable}
              onChangeTableType={onChangeTableType}
              onRequestDelete={setConfirmDeleteTableId}
            />
          )}

          {selectedAreaData && (
            <AreaInspectorCard
              area={selectedAreaData}
              organizations={organizations}
              tablesInArea={tablesInSelectedArea}
              assignAreaError={assignAreaError}
              setAssignAreaError={setAssignAreaError}
              resizeAreaError={resizeAreaError}
              setResizeAreaError={setResizeAreaError}
              onRotateArea={onRotateArea}
              onUpdateAreaLabel={onUpdateAreaLabel}
              onResizeArea={onResizeArea}
              onAssignAreaToItem={onAssignAreaToItem}
              onRequestDelete={setConfirmDeleteAreaId}
            />
          )}
        </aside>
      </div>
      <AddLayoutDialog
        open={showAddLayout}
        onClose={() => setShowAddLayout(false)}
        onSave={handleAddLayout}
        error={addLayoutError}
        value={newLayout}
        onChange={setNewLayout}
        dayOptions={dayOptions}
        roomLayouts={roomLayouts}
      />
      <AddAreaDialog
        open={showAddArea}
        onClose={() => setShowAddArea(false)}
        onSave={handleAddArea}
        error={addAreaError}
        value={newArea}
        onChange={setNewArea}
        organizations={organizations}
      />
      <AddTableDialog
        open={showAddTable}
        onClose={() => setShowAddTable(false)}
        onSave={handleAddTable}
        error={addTableError}
        value={newTable}
        onChange={setNewTable}
        tableTypes={tableTypes}
        venueId={activeRoom?.venue_id}
      />

      {confirmDeleteLayoutId && (
        <ConfirmModal
          admin
          show
          title={m.admin_layout_delete_title()}
          body={m.admin_layout_delete_confirm({
            name: (() => {
              const layout = layouts.find((candidate) => candidate.id === confirmDeleteLayoutId);
              return layout ? getDayLabel(layout, dayOptions) : "";
            })(),
          })}
          confirmLabel={m.admin_delete()}
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
          body={m.admin_layout_table_delete_confirm({
            name: tables.find((table) => table.id === confirmDeleteTableId)?.name ?? "",
          })}
          confirmLabel={m.admin_delete()}
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
          body={m.admin_layout_area_delete_confirm({
            name: canvasAreas.find((area) => area.id === confirmDeleteAreaId)?.label ?? "",
          })}
          confirmLabel={m.admin_delete()}
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

          onSaveRevision={onSaveRevision}
          onRestoreRevision={onRestoreRevision}
        />
      )}
    </div>
  );
}

export default function LayoutEditor() {
  const { queries, activeEdition } = useAdminWorkspace();
  const { tablesCollection, venueCollections } = queries;
  const { layoutDayOptions } = useAdminDashboardData(activeEdition);
  const actions = useAdminVenueActions({ tablesCollection, venueCollections });
  const { handleSaveAllocations, confirmDialog } = useWorkspaceRegistrationActions();
  return (
    <>
      <LayoutEditorView
        dayOptions={layoutDayOptions}
        tables={queries.tablesQuery.data ?? []}
        tableTypes={queries.tableTypesQuery.data ?? []}
        layouts={queries.layoutsQuery.data ?? []}
        registrations={queries.registrationsQuery.data ?? []}
        rooms={queries.roomsQuery.data ?? []}
        organizations={queries.organizationsQuery.data ?? []}
        areas={queries.areasQuery.data ?? []}
        onAddTable={actions.handleAddTable}
        onMoveTable={actions.handleMoveTable}
        onDeleteTable={actions.handleDeleteTable}
        onRotateTable={actions.handleRotateTable}
        onAddLayout={actions.handleAddLayout}
        onDeleteLayout={actions.handleDeleteLayout}
        onAddArea={actions.handleAddArea}
        onMoveArea={actions.handleMoveArea}
        onDeleteArea={actions.handleDeleteArea}
        onRotateArea={actions.handleRotateArea}
        onAssignAreaToItem={actions.handleAssignAreaToItem}
        onUpdateAreaLabel={actions.handleUpdateAreaLabel}
        onChangeTableType={actions.handleChangeTableType}
        onUpdateTable={actions.handleUpdateTable}
        onResizeArea={actions.handleResizeArea}
        onSaveRevision={actions.handleSaveRevision}
        onRestoreRevision={actions.handleRestoreRevision}
        onSaveAllocations={handleSaveAllocations}
      />
      {confirmDialog}
    </>
  );
}

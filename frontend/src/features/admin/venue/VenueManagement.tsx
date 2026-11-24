import { useAdminWorkspace } from "../shell/AdminWorkspace";
import { useAdminVenueActions } from "../shell/useAdminVenueActions";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminAddButton } from "@/components/admin/RowActions";
import { InfoIcon, MapPinIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useCallback, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type {
  FloorTable,
  Layout,
  Room,
  RoomUpdate,
  TableType,
  TableTypeCreate,
  TableTypeUpdate,
  Venue,
  VenueUpdate,
} from "@/api-types";
import ConfirmModal from "@/components/ConfirmModal";
import { VenueFormDialog } from "./management/VenueFormDialog";
import { RoomFormDialog } from "./management/RoomFormDialog";
import { TableTypeFormDialog } from "./management/TableTypeFormDialog";
import { VenueCard, type VenueCardActions } from "./management/VenueCard";

/**
 * VenueManagement — CRUD for venues and the rooms and table types they own.
 *
 * Managers define venues, rooms, and table types here. The LayoutEditor then
 * uses rooms as navigation tabs when organising floor plans, and table types
 * as the picker when placing a table (filtered to the room's own venue).
 * The venue card and the three add/edit dialogs live in `./management/`; this
 * module keeps the dialog targets, error state and archive/restore/delete handlers.
 */

interface VenueManagementProps {
  venues: Venue[];
  rooms: Room[];
  tableTypes: TableType[];
  tables: FloorTable[];
  layouts: Layout[];
  onAdd: (
    name: string,
    address: string,
    city: string,
    postalCode: string,
    country: string,
    lat: number | null,
    lng: number | null,
  ) => Promise<void>;
  onUpdate: (id: string, data: VenueUpdate) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddRoom: (
    venueId: string,
    name: string,
    widthM: number,
    lengthM: number,
    color: string,
  ) => Promise<void>;
  onUpdateRoom: (roomId: string, data: RoomUpdate) => Promise<void>;
  onArchiveRoom: (roomId: string) => Promise<void>;
  onRestoreRoom: (roomId: string) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onAddTableType: (data: TableTypeCreate) => Promise<void>;
  onUpdateTableType: (id: string, data: TableTypeUpdate) => Promise<void>;
  onArchiveTableType: (id: string) => Promise<void>;
  onRestoreTableType: (id: string) => Promise<void>;
  onDeleteTableType: (id: string) => Promise<void>;
}

export function VenueManagementView({
  venues,
  rooms,
  tableTypes,
  tables,
  layouts,
  onAdd,
  onUpdate,
  onArchive,
  onRestore,
  onDelete,
  onAddRoom,
  onUpdateRoom,
  onArchiveRoom,
  onRestoreRoom,
  onDeleteRoom,
  onAddTableType,
  onUpdateTableType,
  onArchiveTableType,
  onRestoreTableType,
  onDeleteTableType,
}: VenueManagementProps) {
  // Venue add
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [addVenueError, setAddVenueError] = useState<string | null>(null);
  const [deleteVenueError, setDeleteVenueError] = useState<string | null>(null);

  // Room add/edit (shared modal)
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [addRoomError, setAddRoomError] = useState<string | null>(null);
  const [deleteRoomError, setDeleteRoomError] = useState<string | null>(null);

  // Table type add/edit (shared modal)
  const [showTableTypeModal, setShowTableTypeModal] = useState(false);
  const [editingTableTypeId, setEditingTableTypeId] = useState<string | null>(null);
  const [addTableTypeError, setAddTableTypeError] = useState<string | null>(null);
  const [deleteTableTypeError, setDeleteTableTypeError] = useState<string | null>(null);

  const editingVenue = editingVenueId
    ? (venues.find((v) => v.id === editingVenueId) ?? null)
    : null;

  const openAddVenue = () => {
    setEditingVenueId(null);
    setAddVenueError(null);
    setShowVenueModal(true);
  };

  const openEditVenue = (venue: Venue) => {
    setEditingVenueId(venue.id);
    setAddVenueError(null);
    setShowVenueModal(true);
  };

  const [confirmArchiveVenueId, setConfirmArchiveVenueId] = useState<string | null>(null);
  const [confirmDeleteVenueId, setConfirmDeleteVenueId] = useState<string | null>(null);

  const handleRestoreVenue = useCallback(
    async (id: string) => {
      setDeleteVenueError(null);
      try {
        await onRestore(id);
      } catch (err) {
        setDeleteVenueError(apiErrorMessage(err, m.admin_error_restore_venue()));
      }
    },
    [onRestore],
  );

  // The venue a new room is being added under — a room being edited derives
  // its venue from the room itself instead (see `roomDefaultValues`).
  const [addRoomVenueId, setAddRoomVenueId] = useState<string | null>(null);
  const editingRoom = editingRoomId ? (rooms.find((r) => r.id === editingRoomId) ?? null) : null;

  const openAddRoom = (venueId: string) => {
    setEditingRoomId(null);
    setAddRoomVenueId(venueId);
    setAddRoomError(null);
    setShowRoomModal(true);
  };

  const openEditRoom = (room: Room) => {
    setEditingRoomId(room.id);
    setAddRoomError(null);
    setShowRoomModal(true);
  };

  const handleArchiveRoom = useCallback(
    async (roomId: string) => {
      setDeleteRoomError(null);
      try {
        await onArchiveRoom(roomId);
      } catch (err) {
        setDeleteRoomError(apiErrorMessage(err, m.admin_content_error_save()));
      }
    },
    [onArchiveRoom],
  );

  const handleRestoreRoom = useCallback(
    async (roomId: string) => {
      setDeleteRoomError(null);
      try {
        await onRestoreRoom(roomId);
      } catch (err) {
        setDeleteRoomError(apiErrorMessage(err, m.admin_content_error_save()));
      }
    },
    [onRestoreRoom],
  );

  const [confirmDeleteRoomId, setConfirmDeleteRoomId] = useState<string | null>(null);

  const [confirmDeleteTableTypeId, setConfirmDeleteTableTypeId] = useState<string | null>(null);

  // The venue a new table type is being added under — a type being edited
  // derives its venue from the type itself instead (see `tableTypeDefaultValues`).
  const [addTableTypeVenueId, setAddTableTypeVenueId] = useState<string | null>(null);
  const editingTableType = editingTableTypeId
    ? (tableTypes.find((tt) => tt.id === editingTableTypeId) ?? null)
    : null;

  const openAddTableType = (venueId: string) => {
    setEditingTableTypeId(null);
    setAddTableTypeVenueId(venueId);
    setAddTableTypeError(null);
    setShowTableTypeModal(true);
  };

  const openEditTableType = (tt: TableType) => {
    setEditingTableTypeId(tt.id);
    setAddTableTypeError(null);
    setShowTableTypeModal(true);
  };

  const handleArchiveTableType = useCallback(
    async (id: string) => {
      setDeleteTableTypeError(null);
      try {
        await onArchiveTableType(id);
      } catch (err) {
        setDeleteTableTypeError(apiErrorMessage(err, m.admin_content_error_save()));
      }
    },
    [onArchiveTableType],
  );

  const handleRestoreTableType = useCallback(
    async (id: string) => {
      setDeleteTableTypeError(null);
      try {
        await onRestoreTableType(id);
      } catch (err) {
        setDeleteTableTypeError(apiErrorMessage(err, m.admin_content_error_save()));
      }
    },
    [onRestoreTableType],
  );

  const cardActions: VenueCardActions = {
    openEditVenue,
    handleRestoreVenue,
    setConfirmArchiveVenueId,
    setConfirmDeleteVenueId,
    openAddRoom,
    openEditRoom,
    handleArchiveRoom,
    handleRestoreRoom,
    setConfirmDeleteRoomId,
    openAddTableType,
    openEditTableType,
    handleArchiveTableType,
    handleRestoreTableType,
    setConfirmDeleteTableTypeId,
  };

  return (
    <Card tone="secondary">
      <CardHeader className="flex items-center justify-between">
        <span className="font-semibold">
          <Icon icon={MapPinIcon} className="me-2" />
          {m.admin_venues_rooms_tab()}
        </span>
        <AdminAddButton onClick={openAddVenue}>{m.admin_venue_add()}</AdminAddButton>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {deleteVenueError && (
          <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-0 text-sm">
            {deleteVenueError}
          </Alert>
        )}
        {deleteRoomError && (
          <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-0 text-sm">
            {deleteRoomError}
          </Alert>
        )}
        {deleteTableTypeError && (
          <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-0 text-sm">
            {deleteTableTypeError}
          </Alert>
        )}
        {venues.length === 0 ? (
          <AdminEmptyState>
            <Icon icon={InfoIcon} className="me-1" />
            {m.admin_no_venues()}
          </AdminEmptyState>
        ) : (
          venues.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              rooms={rooms}
              tableTypes={tableTypes}
              actions={cardActions}
            />
          ))
        )}
      </CardContent>

      <VenueFormDialog
        open={showVenueModal}
        onClose={() => setShowVenueModal(false)}
        onSaved={() => {
          setEditingVenueId(null);
          setShowVenueModal(false);
        }}
        editingId={editingVenueId}
        editingVenue={editingVenue}
        error={addVenueError}
        onError={setAddVenueError}
        onAdd={onAdd}
        onUpdate={onUpdate}
      />
      <RoomFormDialog
        open={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        editingId={editingRoomId}
        editingRoom={editingRoom}
        addVenueId={addRoomVenueId}
        venues={venues}
        error={addRoomError}
        onError={setAddRoomError}
        onAddRoom={onAddRoom}
        onUpdateRoom={onUpdateRoom}
      />
      <TableTypeFormDialog
        open={showTableTypeModal}
        onClose={() => setShowTableTypeModal(false)}
        editingId={editingTableTypeId}
        editingTableType={editingTableType}
        addVenueId={addTableTypeVenueId}
        venues={venues}
        tables={tables}
        layouts={layouts}
        error={addTableTypeError}
        onError={setAddTableTypeError}
        onAddTableType={onAddTableType}
        onUpdateTableType={onUpdateTableType}
      />

      {confirmArchiveVenueId && (
        <ConfirmModal
          admin
          show
          title={m.admin_venue_archive_title()}
          body={m.admin_venue_archive_confirm()}
          variant="warning"
          icon="archive"
          confirmLabel={m.admin_content_archive()}
          errorFallback={m.admin_error_archive_venue()}
          onConfirm={() => onArchive(confirmArchiveVenueId)}
          onHide={() => setConfirmArchiveVenueId(null)}
        />
      )}
      {confirmDeleteVenueId && (
        <ConfirmModal
          admin
          show
          title={m.admin_venue_delete_title()}
          body={m.admin_venue_delete_confirm({
            name: venues.find((venue) => venue.id === confirmDeleteVenueId)?.name ?? "",
          })}
          confirmLabel={m.admin_delete()}
          errorFallback={m.admin_error_delete_venue()}
          onConfirm={() => onDelete(confirmDeleteVenueId)}
          onHide={() => setConfirmDeleteVenueId(null)}
        />
      )}
      {confirmDeleteRoomId && (
        <ConfirmModal
          admin
          show
          title={m.admin_room_delete_title()}
          body={m.admin_room_delete_confirm({
            name: rooms.find((room) => room.id === confirmDeleteRoomId)?.name ?? "",
          })}
          confirmLabel={m.admin_delete()}
          errorFallback={m.admin_error_delete_room()}
          onConfirm={() => onDeleteRoom(confirmDeleteRoomId)}
          onHide={() => setConfirmDeleteRoomId(null)}
        />
      )}
      {confirmDeleteTableTypeId && (
        <ConfirmModal
          admin
          show
          title={m.admin_table_type_delete_title()}
          body={m.admin_table_type_delete_confirm({
            name: tableTypes.find((tt) => tt.id === confirmDeleteTableTypeId)?.name ?? "",
          })}
          confirmLabel={m.admin_delete()}
          errorFallback={m.admin_error_delete_table_type()}
          onConfirm={() => onDeleteTableType(confirmDeleteTableTypeId)}
          onHide={() => setConfirmDeleteTableTypeId(null)}
        />
      )}
    </Card>
  );
}

export default function VenueManagement() {
  const { queries } = useAdminWorkspace();
  const { tablesCollection, venueCollections } = queries;
  const actions = useAdminVenueActions({ tablesCollection, venueCollections });
  return (
    <VenueManagementView
      venues={queries.venuesQuery.data ?? []}
      rooms={queries.roomsQuery.data ?? []}
      tableTypes={queries.tableTypesQuery.data ?? []}
      tables={queries.tablesQuery.data ?? []}
      layouts={queries.layoutsQuery.data ?? []}
      onAdd={actions.handleAddVenue}
      onUpdate={actions.handleUpdateVenue}
      onArchive={actions.handleArchiveVenue}
      onRestore={actions.handleRestoreVenue}
      onDelete={actions.handleDeleteVenue}
      onAddRoom={actions.handleAddRoom}
      onUpdateRoom={actions.handleUpdateRoom}
      onArchiveRoom={actions.handleArchiveRoom}
      onRestoreRoom={actions.handleRestoreRoom}
      onDeleteRoom={actions.handleDeleteRoom}
      onAddTableType={actions.handleAddTableType}
      onUpdateTableType={actions.handleUpdateTableType}
      onArchiveTableType={actions.handleArchiveTableType}
      onRestoreTableType={actions.handleRestoreTableType}
      onDeleteTableType={actions.handleDeleteTableType}
    />
  );
}

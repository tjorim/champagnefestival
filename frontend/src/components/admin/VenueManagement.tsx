/**
 * VenueManagement — CRUD for venues and the rooms and table types they own.
 *
 * Managers define venues, rooms, and table types here. The LayoutEditor then
 * uses rooms as navigation tabs when organising floor plans, and table types
 * as the picker when placing a table (filtered to the room's own venue).
 */

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { FloorTable, Layout, Room, TableType, Venue } from "@/types/admin";
import { useAppTable, createAppColumnHelper } from "@/hooks/useAdminTable";

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
  ) => Promise<void>;
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
  onUpdateRoom: (roomId: string, data: Partial<Omit<Room, "id" | "dimensionsPlaceholder">>) => Promise<void>;
  onArchiveRoom: (roomId: string) => Promise<void>;
  onRestoreRoom: (roomId: string) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onAddTableType: (data: Omit<TableType, "id">) => Promise<void>;
  onUpdateTableType: (id: string, data: Partial<Omit<TableType, "id">>) => Promise<void>;
  onArchiveTableType: (id: string) => Promise<void>;
  onRestoreTableType: (id: string) => Promise<void>;
  onDeleteTableType: (id: string) => Promise<void>;
}

const emptyVenueForm = { name: "", address: "", city: "", postalCode: "", country: "" };

/** Pick black or white text to contrast against a hex background colour. */
function contrastColor(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#fff";
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#000" : "#fff";
}
// widthM/lengthM start blank — a room's real dimensions have no defensible
// generic default (see #833/#835), so the admin must enter them deliberately
// rather than accidentally saving a made-up size.
const emptyRoomForm: {
  venueId: string;
  name: string;
  widthM: number | "";
  lengthM: number | "";
  color: string;
} = { venueId: "", name: "", widthM: "", lengthM: "", color: "#ffc107" };

// venueId starts blank (filled from the venue row the admin clicked "+" on) and
// widthM/lengthM start blank — a table type belongs to exactly one venue (like a
// room, see #858) and its real dimensions have no defensible generic default
// (see #833/#835), so the admin must set both deliberately.
const emptyTableTypeForm: {
  venueId: string;
  name: string;
  shape: "rectangle" | "round";
  widthM: number | "";
  lengthM: number | "";
  heightType: "low" | "high";
  maxCapacity: number;
  active: boolean;
} = {
  venueId: "",
  name: "",
  shape: "rectangle",
  widthM: "",
  lengthM: "",
  heightType: "low",
  maxCapacity: 4,
  active: true,
};

const columnHelper = createAppColumnHelper<Venue>();

export default function VenueManagement({
  venues,
  rooms,
  tableTypes,
  tables,
  layouts,
  onAdd,
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
  const [venueForm, setVenueForm] = useState(emptyVenueForm);
  const [addVenueError, setAddVenueError] = useState<string | null>(null);
  const [deleteVenueError, setDeleteVenueError] = useState<string | null>(null);

  // Room add/edit (shared modal)
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  // Dimensions as loaded into the edit form, so `handleSaveRoom` can tell whether the
  // admin actually changed width/length — see its comment for why that distinction matters.
  const [editingRoomOriginalDims, setEditingRoomOriginalDims] = useState<{
    widthM: number;
    lengthM: number;
  } | null>(null);
  const [addRoomError, setAddRoomError] = useState<string | null>(null);
  const [deleteRoomError, setDeleteRoomError] = useState<string | null>(null);

  // Table type add/edit (shared modal)
  const [showTableTypeModal, setShowTableTypeModal] = useState(false);
  const [editingTableTypeId, setEditingTableTypeId] = useState<string | null>(null);
  const [tableTypeForm, setTableTypeForm] = useState(emptyTableTypeForm);
  // Shape/dimensions as loaded into the edit form, so `handleSaveTableType` can tell
  // whether the admin actually changed the reshape-risky fields — see its comment for
  // why that distinction matters (#858).
  const [editingTableTypeOriginalShape, setEditingTableTypeOriginalShape] = useState<{
    shape: "rectangle" | "round";
    widthM: number;
    lengthM: number;
  } | null>(null);
  const [addTableTypeError, setAddTableTypeError] = useState<string | null>(null);
  const [deleteTableTypeError, setDeleteTableTypeError] = useState<string | null>(null);

  const handleAddVenue = useCallback(async () => {
    if (!venueForm.name.trim()) return;
    setAddVenueError(null);
    try {
      await onAdd(
        venueForm.name.trim(),
        venueForm.address.trim(),
        venueForm.city.trim(),
        venueForm.postalCode.trim(),
        venueForm.country.trim(),
      );
      setVenueForm(emptyVenueForm);
      setShowVenueModal(false);
    } catch (err) {
      setAddVenueError(err instanceof Error ? err.message : m.admin_error_add_venue());
    }
  }, [venueForm, onAdd]);

  const handleArchiveVenue = useCallback(
    async (id: string) => {
      if (!window.confirm(m.admin_venue_archive_confirm())) return;
      setDeleteVenueError(null);
      try {
        await onArchive(id);
      } catch (err) {
        setDeleteVenueError(err instanceof Error ? err.message : m.admin_error_archive_venue());
      }
    },
    [onArchive],
  );

  const handleRestoreVenue = useCallback(
    async (id: string) => {
      setDeleteVenueError(null);
      try {
        await onRestore(id);
      } catch (err) {
        setDeleteVenueError(err instanceof Error ? err.message : m.admin_error_restore_venue());
      }
    },
    [onRestore],
  );

  const handleDeleteVenue = useCallback(
    async (id: string) => {
      if (!window.confirm(m.admin_venue_delete_confirm())) return;
      setDeleteVenueError(null);
      try {
        await onDelete(id);
      } catch (err) {
        setDeleteVenueError(err instanceof Error ? err.message : m.admin_error_delete_venue());
      }
    },
    [onDelete],
  );

  const isRoomFormValid = useCallback(
    () =>
      Boolean(roomForm.venueId) &&
      roomForm.name.trim().length > 0 &&
      typeof roomForm.widthM === "number" &&
      roomForm.widthM >= 1 &&
      typeof roomForm.lengthM === "number" &&
      roomForm.lengthM >= 1,
    [roomForm],
  );

  const openAddRoom = useCallback((venueId: string) => {
    setEditingRoomId(null);
    setEditingRoomOriginalDims(null);
    setRoomForm({ ...emptyRoomForm, venueId });
    setAddRoomError(null);
    setShowRoomModal(true);
  }, []);

  const openEditRoom = useCallback((room: Room) => {
    setEditingRoomId(room.id);
    setEditingRoomOriginalDims({ widthM: room.widthM, lengthM: room.lengthM });
    setRoomForm({
      venueId: room.venueId,
      name: room.name,
      widthM: room.widthM,
      lengthM: room.lengthM,
      color: room.color,
    });
    setAddRoomError(null);
    setShowRoomModal(true);
  }, []);

  const handleSaveRoom = useCallback(async () => {
    if (!isRoomFormValid() || typeof roomForm.widthM !== "number" || typeof roomForm.lengthM !== "number") {
      return;
    }
    setAddRoomError(null);
    try {
      if (editingRoomId) {
        // Omit widthM/lengthM entirely when they match what the form was opened with —
        // the backend clears a room's `dimensionsPlaceholder` flag whenever either field
        // is present in the update, so sending them unchanged on an unrelated edit (e.g.
        // renaming or recolouring) would wrongly mark an unverified legacy 20x15 room as
        // a confirmed, measured one.
        const dimensionsChanged =
          editingRoomOriginalDims === null ||
          editingRoomOriginalDims.widthM !== roomForm.widthM ||
          editingRoomOriginalDims.lengthM !== roomForm.lengthM;
        await onUpdateRoom(editingRoomId, {
          venueId: roomForm.venueId,
          name: roomForm.name.trim(),
          ...(dimensionsChanged ? { widthM: roomForm.widthM, lengthM: roomForm.lengthM } : {}),
          color: roomForm.color,
        });
      } else {
        await onAddRoom(
          roomForm.venueId,
          roomForm.name.trim(),
          roomForm.widthM,
          roomForm.lengthM,
          roomForm.color,
        );
      }
      setRoomForm(emptyRoomForm);
      setEditingRoomOriginalDims(null);
      setShowRoomModal(false);
    } catch (err) {
      setAddRoomError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [isRoomFormValid, roomForm, editingRoomId, editingRoomOriginalDims, onAddRoom, onUpdateRoom]);

  const handleArchiveRoom = useCallback(
    async (roomId: string) => {
      setDeleteRoomError(null);
      try {
        await onArchiveRoom(roomId);
      } catch (err) {
        setDeleteRoomError(err instanceof Error ? err.message : m.admin_content_error_save());
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
        setDeleteRoomError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [onRestoreRoom],
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      setDeleteRoomError(null);
      try {
        await onDeleteRoom(roomId);
      } catch (err) {
        // The API refuses while layouts still reference the room; surface that
        // rather than leaving the button looking inert.
        setDeleteRoomError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [onDeleteRoom],
  );

  const openAddTableType = useCallback((venueId: string) => {
    setEditingTableTypeId(null);
    setEditingTableTypeOriginalShape(null);
    setTableTypeForm({ ...emptyTableTypeForm, venueId });
    setAddTableTypeError(null);
    setShowTableTypeModal(true);
  }, []);

  const openEditTableType = useCallback((tt: TableType) => {
    setEditingTableTypeId(tt.id);
    setEditingTableTypeOriginalShape({ shape: tt.shape, widthM: tt.widthM, lengthM: tt.lengthM });
    setTableTypeForm({
      venueId: tt.venueId,
      name: tt.name,
      shape: tt.shape,
      widthM: tt.widthM,
      lengthM: tt.lengthM,
      heightType: tt.heightType,
      maxCapacity: tt.maxCapacity,
      active: tt.active,
    });
    setAddTableTypeError(null);
    setShowTableTypeModal(true);
  }, []);

  const handleSaveTableType = useCallback(async () => {
    // Every rejected input needs to say why — bailing silently leaves the Save
    // button looking broken.
    if (!tableTypeForm.name.trim()) {
      setAddTableTypeError(m.admin_table_type_name_required());
      return;
    }
    if (!tableTypeForm.venueId) {
      setAddTableTypeError(m.admin_table_type_venue_required());
      return;
    }
    if (tableTypeForm.maxCapacity < 1 || !Number.isInteger(tableTypeForm.maxCapacity)) {
      setAddTableTypeError(m.admin_table_type_capacity_min());
      return;
    }
    const { widthM, lengthM } = tableTypeForm;
    if (
      typeof widthM !== "number" ||
      widthM <= 0 ||
      typeof lengthM !== "number" ||
      lengthM <= 0
    ) {
      setAddTableTypeError(m.admin_table_type_dimensions_positive());
      return;
    }
    // Tables render by joining live against TableType rather than a dimension
    // snapshot taken at placement time, so a shape/dimension change here silently
    // redraws every table of this type on every layout that ever placed one —
    // including past editions (#858). Surface the blast radius and let the admin
    // back out before that happens; a name/capacity/venue-only edit is unaffected.
    if (
      editingTableTypeId &&
      editingTableTypeOriginalShape &&
      (tableTypeForm.shape !== editingTableTypeOriginalShape.shape ||
        widthM !== editingTableTypeOriginalShape.widthM ||
        lengthM !== editingTableTypeOriginalShape.lengthM)
    ) {
      const affectedTableIds = tables
        .filter((t) => t.tableTypeId === editingTableTypeId)
        .map((t) => t.layoutId);
      const affectedRoomIds = new Set(
        affectedTableIds
          .map((layoutId) => layouts.find((l) => l.id === layoutId)?.roomId)
          .filter((roomId): roomId is string => Boolean(roomId)),
      );
      if (
        affectedTableIds.length > 0 &&
        !window.confirm(
          m.admin_table_type_dimension_change_confirm({
            tableCount: affectedTableIds.length,
            roomCount: affectedRoomIds.size,
          }),
        )
      ) {
        return;
      }
    }
    setAddTableTypeError(null);
    try {
      const payload = { ...tableTypeForm, widthM, lengthM };
      if (editingTableTypeId) {
        const { active: _active, ...updateData } = payload;
        await onUpdateTableType(editingTableTypeId, updateData);
      } else {
        await onAddTableType(payload);
      }
      setTableTypeForm(emptyTableTypeForm);
      setEditingTableTypeOriginalShape(null);
      setShowTableTypeModal(false);
    } catch (err) {
      setAddTableTypeError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [
    tableTypeForm,
    editingTableTypeId,
    editingTableTypeOriginalShape,
    tables,
    layouts,
    onAddTableType,
    onUpdateTableType,
  ]);

  const handleArchiveTableType = useCallback(
    async (id: string) => {
      setDeleteTableTypeError(null);
      try {
        await onArchiveTableType(id);
      } catch (err) {
        setDeleteTableTypeError(err instanceof Error ? err.message : m.admin_content_error_save());
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
        setDeleteTableTypeError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [onRestoreTableType],
  );

  const handleDeleteTableType = useCallback(
    async (id: string) => {
      if (!window.confirm(m.admin_table_type_delete_confirm())) return;
      setDeleteTableTypeError(null);
      try {
        await onDeleteTableType(id);
      } catch (err) {
        // The API refuses while tables still use the type; surface that instead
        // of leaving the button looking inert.
        setDeleteTableTypeError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [onDeleteTableType],
  );

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: m.admin_venue_name_label(),
          enableSorting: false,
          meta: { tdClassName: "fw-semibold" },
          cell: ({ row }) => {
            const isArchived = !row.original.active;
            return (
              <>
                {row.original.name}
                {isArchived && (
                  <Badge bg="secondary" className="ms-2 fs-2xs">
                    {m.admin_venue_archived_badge()}
                  </Badge>
                )}
              </>
            );
          },
        }),
        columnHelper.accessor("address", {
          header: m.admin_venue_address_label(),
          enableSorting: false,
          meta: { tdClassName: "text-secondary" },
          cell: ({ getValue }) => getValue() || "—",
        }),
        columnHelper.accessor("city", {
          header: m.admin_venue_city_label(),
          enableSorting: false,
          meta: { tdClassName: "text-secondary" },
          cell: ({ getValue }) => getValue() || "—",
        }),
        columnHelper.accessor("postalCode", {
          header: m.admin_venue_postal_code_label(),
          enableSorting: false,
          meta: { tdClassName: "text-secondary" },
          cell: ({ getValue }) => getValue() || "—",
        }),
        columnHelper.accessor("country", {
          header: m.admin_venue_country_label(),
          enableSorting: false,
          meta: { tdClassName: "text-secondary" },
          cell: ({ getValue }) => getValue() || "—",
        }),
        columnHelper.display({
          id: "rooms",
          header: m.admin_room_name_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const venue = row.original;
            if (venue.active === false) return null;
            const venueRooms = rooms.filter((r) => r.venueId === venue.id);
            return (
              <div className="d-flex flex-wrap gap-1 align-items-center">
                {venueRooms.map((room) => (
                  <Badge
                    key={room.id}
                    style={{
                      background: room.active ? room.color : undefined,
                      fontSize: "0.75rem",
                      opacity: room.active ? 1 : 0.5,
                    }}
                    bg={room.active ? undefined : "secondary"}
                    className="d-inline-flex align-items-center gap-1"
                  >
                    <span
                      style={{
                        color: room.active ? contrastColor(room.color) : undefined,
                      }}
                    >
                      {room.name}
                    </span>
                    {room.dimensionsPlaceholder && (
                      <i
                        className="bi bi-exclamation-triangle-fill fs-5xs"
                        aria-label={m.admin_room_dimensions_placeholder_badge()}
                        title={m.admin_room_dimensions_placeholder_hint()}
                      />
                    )}
                    {room.active ? (
                      <>
                        <button
                          type="button"
                          className={clsx(
                            "btn btn-sm p-0 border-0 bg-transparent fs-5xs lh-1",
                            contrastColor(room.color) === "#fff" ? "text-white" : "text-dark",
                          )}
                          onClick={() => openEditRoom(room)}
                          aria-label={m.admin_edit()}
                          title={m.admin_edit()}
                        >
                          <i className="bi bi-pencil" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={clsx(
                            "btn-close fs-5xs",
                            contrastColor(room.color) === "#fff" && "btn-close-white",
                          )}
                          onClick={() => handleArchiveRoom(room.id)}
                          aria-label={m.admin_content_archive()}
                          title={m.admin_content_archive()}
                        />
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm p-0 border-0 bg-transparent text-white fs-5xs lh-1"
                          onClick={() => handleRestoreRoom(room.id)}
                          aria-label={m.admin_content_restore()}
                          title={m.admin_content_restore()}
                        >
                          <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm p-0 border-0 bg-transparent text-white fs-5xs lh-1"
                          onClick={() => handleDeleteRoom(room.id)}
                          aria-label={`${m.admin_delete()} ${room.name}`}
                          title={m.admin_delete()}
                        >
                          <i className="bi bi-trash" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </Badge>
                ))}
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="py-0 px-1 fs-2xs"
                  onClick={() => openAddRoom(venue.id)}
                >
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                  {m.admin_room_add()}
                </Button>
              </div>
            );
          },
        }),
        columnHelper.display({
          id: "tableTypes",
          header: m.admin_table_types_tab(),
          enableSorting: false,
          cell: ({ row }) => {
            const venue = row.original;
            if (venue.active === false) return null;
            const venueTableTypes = tableTypes.filter((tt) => tt.venueId === venue.id);
            return (
              <div className="d-flex flex-wrap gap-1 align-items-center">
                {venueTableTypes.map((tt) => (
                  <Badge
                    key={tt.id}
                    bg={tt.active ? "dark" : "secondary"}
                    className={clsx(
                      "d-inline-flex align-items-center gap-1 border border-secondary",
                      !tt.active && "opacity-50",
                    )}
                    style={{ fontSize: "0.75rem" }}
                  >
                    <i
                      className={tt.shape === "round" ? "bi bi-circle" : "bi bi-square"}
                      aria-hidden="true"
                    />
                    <span>{tt.name}</span>
                    {tt.active ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm p-0 border-0 bg-transparent text-white fs-5xs lh-1"
                          onClick={() => openEditTableType(tt)}
                          aria-label={m.admin_edit()}
                          title={m.admin_edit()}
                        >
                          <i className="bi bi-pencil" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn-close btn-close-white fs-5xs"
                          onClick={() => handleArchiveTableType(tt.id)}
                          aria-label={m.admin_content_archive()}
                          title={m.admin_content_archive()}
                        />
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm p-0 border-0 bg-transparent text-white fs-5xs lh-1"
                          onClick={() => handleRestoreTableType(tt.id)}
                          aria-label={m.admin_content_restore()}
                          title={m.admin_content_restore()}
                        >
                          <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm p-0 border-0 bg-transparent text-white fs-5xs lh-1"
                          onClick={() => handleDeleteTableType(tt.id)}
                          aria-label={`${m.admin_delete()} ${tt.name}`}
                          title={m.admin_delete()}
                        >
                          <i className="bi bi-trash" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </Badge>
                ))}
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="py-0 px-1 fs-2xs"
                  onClick={() => openAddTableType(venue.id)}
                >
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                  {m.admin_add_table_type()}
                </Button>
              </div>
            );
          },
        }),
        columnHelper.display({
          id: "actions",
          header: () => m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const venue = row.original;
            const isArchived = !venue.active;
            return (
              <div className="d-flex gap-1 justify-content-end">
                {isArchived ? (
                  <>
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => handleRestoreVenue(venue.id)}
                      aria-label={m.admin_content_restore()}
                      title={m.admin_content_restore()}
                    >
                      <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteVenue(venue.id)}
                      aria-label={m.admin_delete()}
                      title={m.admin_delete()}
                    >
                      <i className="bi bi-trash" aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => handleArchiveVenue(venue.id)}
                    aria-label={m.admin_content_archive()}
                    title={m.admin_content_archive()}
                  >
                    <i className="bi bi-archive" aria-hidden="true" />
                  </Button>
                )}
              </div>
            );
          },
        }),
      ]),
    [
      rooms,
      tableTypes,
      openAddRoom,
      openEditRoom,
      handleArchiveRoom,
      handleRestoreRoom,
      handleDeleteRoom,
      openAddTableType,
      openEditTableType,
      handleArchiveTableType,
      handleRestoreTableType,
      handleDeleteTableType,
      handleArchiveVenue,
      handleRestoreVenue,
      handleDeleteVenue,
    ],
  );

  const table = useAppTable(
    {
      data: venues,
      columns,
      getRowId: (row) => row.id,
    },
    () => ({}),
  );

  return (
    <Card bg="dark" text="white" border="secondary">
      <Card.Header className="d-flex align-items-center justify-content-between">
        <span className="fw-semibold">
          <i className="bi bi-geo-alt me-2" aria-hidden="true" />
          {m.admin_venue_add()}
        </span>
        <Button
          variant="outline-warning"
          size="sm"
          onClick={() => {
            setAddVenueError(null);
            setShowVenueModal(true);
          }}
        >
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_venue_add()}
        </Button>
      </Card.Header>
      <Card.Body className="p-0">
        {deleteVenueError && (
          <Alert variant="danger" className="m-2 py-1 small">
            {deleteVenueError}
          </Alert>
        )}
        {deleteRoomError && (
          <Alert variant="danger" className="m-2 py-1 small">
            {deleteRoomError}
          </Alert>
        )}
        {deleteTableTypeError && (
          <Alert variant="danger" className="m-2 py-1 small">
            {deleteTableTypeError}
          </Alert>
        )}
        {venues.length === 0 ? (
          <p className="text-secondary text-center small my-3">
            <i className="bi bi-info-circle me-1" aria-hidden="true" />
            {m.admin_no_venues()}
          </p>
        ) : (
          <Table variant="dark" hover responsive className="mb-0 small">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} className={header.column.columnDef.meta?.tdClassName}>
                      <table.FlexRender header={header} />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={clsx(!row.original.active && "opacity-50")}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card.Body>

      {/* Add Venue Modal */}
      <Modal
        show={showVenueModal}
        onHide={() => setShowVenueModal(false)}
        centered
        aria-labelledby="add-venue-modal-title"
      >
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="add-venue-modal-title">{m.admin_venue_add()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addVenueError && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {addVenueError}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="venue-name">
            <Form.Label>{m.admin_venue_name_label()}</Form.Label>
            <Form.Control
              type="text"
              value={venueForm.name}
              onChange={(e) => setVenueForm((p) => ({ ...p, name: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder={m.admin_venue_name_placeholder()}
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="venue-address">
            <Form.Label>{m.admin_venue_address_label()}</Form.Label>
            <Form.Control
              type="text"
              value={venueForm.address}
              onChange={(e) => setVenueForm((p) => ({ ...p, address: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <div className="row g-2 mb-3">
            <div className="col">
              <Form.Group controlId="venue-city">
                <Form.Label>{m.admin_venue_city_label()}</Form.Label>
                <Form.Control
                  type="text"
                  value={venueForm.city}
                  onChange={(e) => setVenueForm((p) => ({ ...p, city: e.target.value }))}
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
            </div>
            <div className="col-auto">
              <Form.Group controlId="venue-postal-code">
                <Form.Label>{m.admin_venue_postal_code_label()}</Form.Label>
                <Form.Control
                  type="text"
                  value={venueForm.postalCode}
                  onChange={(e) => setVenueForm((p) => ({ ...p, postalCode: e.target.value }))}
                  className="bg-dark text-light border-secondary"
                  style={{ width: "7rem" }}
                />
              </Form.Group>
            </div>
          </div>
          <Form.Group controlId="venue-country">
            <Form.Label>{m.admin_venue_country_label()}</Form.Label>
            <Form.Control
              type="text"
              value={venueForm.country}
              onChange={(e) => setVenueForm((p) => ({ ...p, country: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowVenueModal(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="warning" onClick={handleAddVenue} disabled={!venueForm.name.trim()}>
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add/Edit Room Modal */}
      <Modal
        show={showRoomModal}
        onHide={() => setShowRoomModal(false)}
        centered
        aria-labelledby="room-modal-title"
      >
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="room-modal-title">
            {editingRoomId ? m.admin_edit_room() : m.admin_room_add()}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addRoomError && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {addRoomError}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="room-venue">
            <Form.Label>{m.admin_room_venue_label()}</Form.Label>
            <Form.Select
              value={roomForm.venueId}
              onChange={(e) => setRoomForm((p) => ({ ...p, venueId: e.target.value }))}
              className="bg-dark text-light border-secondary"
            >
              {venues
                .filter((v) => v.active)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="room-name">
            <Form.Label>{m.admin_room_name_label()}</Form.Label>
            <Form.Control
              type="text"
              value={roomForm.name}
              onChange={(e) => setRoomForm((p) => ({ ...p, name: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder={m.admin_room_name_placeholder()}
            />
          </Form.Group>
          <div className="row g-2 mb-3">
            <div className="col">
              <Form.Group controlId="room-width">
                <Form.Label>{m.admin_room_width_label()}</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={roomForm.widthM}
                  onChange={(e) =>
                    setRoomForm((p) => ({
                      ...p,
                      widthM: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
            </div>
            <div className="col">
              <Form.Group controlId="room-length">
                <Form.Label>{m.admin_room_length_label()}</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={roomForm.lengthM}
                  onChange={(e) =>
                    setRoomForm((p) => ({
                      ...p,
                      lengthM: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
            </div>
          </div>
          <Form.Group controlId="room-color">
            <Form.Label>{m.admin_room_color_label()}</Form.Label>
            <div className="d-flex gap-2 align-items-center">
              <Form.Control
                type="color"
                value={roomForm.color}
                onChange={(e) => setRoomForm((p) => ({ ...p, color: e.target.value }))}
                style={{ width: 48, height: 38, padding: 2 }}
              />
              <Form.Control
                type="text"
                value={roomForm.color}
                onChange={(e) => setRoomForm((p) => ({ ...p, color: e.target.value }))}
                className="bg-dark text-light border-secondary"
                style={{ fontFamily: "monospace" }}
              />
            </div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowRoomModal(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="warning" onClick={handleSaveRoom} disabled={!isRoomFormValid()}>
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add/Edit Table Type Modal */}
      <Modal
        show={showTableTypeModal}
        onHide={() => setShowTableTypeModal(false)}
        centered
        aria-labelledby="table-type-modal-title"
      >
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="table-type-modal-title">
            {editingTableTypeId ? m.admin_edit_table_type() : m.admin_add_table_type()}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addTableTypeError && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {addTableTypeError}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="tt-venue">
            <Form.Label>{m.admin_room_venue_label()}</Form.Label>
            <Form.Select
              value={tableTypeForm.venueId}
              onChange={(e) => setTableTypeForm((p) => ({ ...p, venueId: e.target.value }))}
              className="bg-dark text-light border-secondary"
            >
              <option value="">— {m.admin_room_venue_label()} —</option>
              {venues
                .filter((v) => v.active || v.id === tableTypeForm.venueId)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="tt-name">
            <Form.Label>{m.admin_table_name()}</Form.Label>
            <Form.Control
              type="text"
              value={tableTypeForm.name}
              onChange={(e) => setTableTypeForm((p) => ({ ...p, name: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder={m.admin_table_type_name_placeholder()}
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="tt-shape">
            <Form.Label>{m.admin_table_shape_label()}</Form.Label>
            <Form.Select
              value={tableTypeForm.shape}
              onChange={(e) => {
                const s = e.target.value as "rectangle" | "round";
                setTableTypeForm((p) => ({
                  ...p,
                  shape: s,
                  widthM: s === "round" ? 0.9 : 0.7,
                  lengthM: s === "round" ? 0.9 : 1.8,
                }));
              }}
              className="bg-dark text-light border-secondary"
            >
              <option value="rectangle">{m.admin_table_shape_rectangle()}</option>
              <option value="round">{m.admin_table_shape_round()}</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="tt-height-type">
            <Form.Label>{m.admin_table_height_type_label()}</Form.Label>
            <Form.Select
              value={tableTypeForm.heightType}
              onChange={(e) =>
                setTableTypeForm((p) => ({ ...p, heightType: e.target.value as "low" | "high" }))
              }
              className="bg-dark text-light border-secondary"
            >
              <option value="low">{m.admin_table_height_type_low()}</option>
              <option value="high">{m.admin_table_height_type_high()}</option>
            </Form.Select>
          </Form.Group>
          {tableTypeForm.shape === "round" ? (
            <Form.Group className="mb-3" controlId="tt-diameter">
              <Form.Label>{m.admin_table_diameter_label()}</Form.Label>
              <Form.Control
                type="number"
                min={0.1}
                max={20}
                step={0.1}
                required
                value={tableTypeForm.widthM}
                onChange={(e) => {
                  const raw = e.target.value;
                  const v = raw === "" ? "" : Number(raw);
                  setTableTypeForm((p) => ({ ...p, widthM: v, lengthM: v }));
                }}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
          ) : (
            <div className="row g-2 mb-3">
              <div className="col">
                <Form.Group controlId="tt-width">
                  <Form.Label>{m.admin_table_width_label()}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0.1}
                    max={20}
                    step={0.1}
                    required
                    value={tableTypeForm.widthM}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const v = raw === "" ? "" : Number(raw);
                      setTableTypeForm((p) =>
                        typeof v === "number" && typeof p.lengthM === "number" && v > p.lengthM
                          ? { ...p, widthM: p.lengthM, lengthM: v }
                          : { ...p, widthM: v },
                      );
                    }}
                    className="bg-dark text-light border-secondary"
                  />
                </Form.Group>
              </div>
              <div className="col">
                <Form.Group controlId="tt-length">
                  <Form.Label>{m.admin_table_length_label()}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0.1}
                    max={20}
                    step={0.1}
                    required
                    value={tableTypeForm.lengthM}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const v = raw === "" ? "" : Number(raw);
                      setTableTypeForm((p) =>
                        typeof v === "number" && typeof p.widthM === "number" && v < p.widthM
                          ? { ...p, lengthM: p.widthM, widthM: v }
                          : { ...p, lengthM: v },
                      );
                    }}
                    className="bg-dark text-light border-secondary"
                  />
                </Form.Group>
              </div>
            </div>
          )}
          <Form.Group controlId="tt-max-capacity">
            <Form.Label>{m.admin_table_type_max_capacity()}</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={50}
              value={tableTypeForm.maxCapacity}
              onChange={(e) =>
                setTableTypeForm((p) => ({ ...p, maxCapacity: Number(e.target.value) }))
              }
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowTableTypeModal(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="warning"
            onClick={handleSaveTableType}
            disabled={
              !tableTypeForm.name.trim() ||
              !tableTypeForm.venueId ||
              tableTypeForm.maxCapacity < 1 ||
              !Number.isInteger(tableTypeForm.maxCapacity) ||
              typeof tableTypeForm.widthM !== "number" ||
              tableTypeForm.widthM <= 0 ||
              typeof tableTypeForm.lengthM !== "number" ||
              tableTypeForm.lengthM <= 0
            }
          >
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
}

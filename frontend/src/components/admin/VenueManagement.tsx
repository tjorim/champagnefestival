/**
 * VenueManagement — CRUD for venues and the rooms and table types they own.
 *
 * Managers define venues, rooms, and table types here. The LayoutEditor then
 * uses rooms as navigation tabs when organising floor plans, and table types
 * as the picker when placing a table (filtered to the room's own venue).
 */

import clsx from "clsx";
import { lazy, Suspense, useCallback, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import { m } from "@/paraglide/messages";
import type { FloorTable, Layout, Room, TableType, Venue } from "@/types/admin";
import ConfirmModal from "@/components/ConfirmModal";

const MapComponent = lazy(() => import("@/components/MapComponent"));

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
    lat: number,
    lng: number,
  ) => Promise<void>;
  onUpdate: (id: string, data: Partial<Omit<Venue, "id" | "active">>) => Promise<void>;
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
  onUpdateRoom: (
    roomId: string,
    data: Partial<Omit<Room, "id" | "dimensionsPlaceholder">>,
  ) => Promise<void>;
  onArchiveRoom: (roomId: string) => Promise<void>;
  onRestoreRoom: (roomId: string) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onAddTableType: (data: Omit<TableType, "id">) => Promise<void>;
  onUpdateTableType: (id: string, data: Partial<Omit<TableType, "id">>) => Promise<void>;
  onArchiveTableType: (id: string) => Promise<void>;
  onRestoreTableType: (id: string) => Promise<void>;
  onDeleteTableType: (id: string) => Promise<void>;
}

const emptyVenueForm = {
  name: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
  lat: "" as number | "",
  lng: "" as number | "",
};

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
  capacity: number;
  active: boolean;
} = {
  venueId: "",
  name: "",
  shape: "rectangle",
  widthM: "",
  lengthM: "",
  heightType: "low",
  capacity: 4,
  active: true,
};

export default function VenueManagement({
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

  const venueCoordinatesAreValid =
    typeof venueForm.lat === "number" &&
    venueForm.lat >= -90 &&
    venueForm.lat <= 90 &&
    typeof venueForm.lng === "number" &&
    venueForm.lng >= -180 &&
    venueForm.lng <= 180;
  const venueFormIsValid = venueForm.name.trim().length > 0 && venueCoordinatesAreValid;
  const previewCoordinates = venueCoordinatesAreValid
    ? { lat: Number(venueForm.lat), lng: Number(venueForm.lng) }
    : null;

  const openAddVenue = useCallback(() => {
    setEditingVenueId(null);
    setVenueForm(emptyVenueForm);
    setAddVenueError(null);
    setShowVenueModal(true);
  }, []);

  const openEditVenue = useCallback((venue: Venue) => {
    setEditingVenueId(venue.id);
    setVenueForm({
      name: venue.name,
      address: venue.address,
      city: venue.city,
      postalCode: venue.postalCode,
      country: venue.country,
      lat: venue.lat,
      lng: venue.lng,
    });
    setAddVenueError(null);
    setShowVenueModal(true);
  }, []);

  const handleSaveVenue = useCallback(async () => {
    if (!venueFormIsValid || typeof venueForm.lat !== "number" || typeof venueForm.lng !== "number")
      return;
    setAddVenueError(null);
    try {
      const data = {
        name: venueForm.name.trim(),
        address: venueForm.address.trim(),
        city: venueForm.city.trim(),
        postalCode: venueForm.postalCode.trim(),
        country: venueForm.country.trim(),
        lat: venueForm.lat,
        lng: venueForm.lng,
      };
      if (editingVenueId) await onUpdate(editingVenueId, data);
      else
        await onAdd(
          data.name,
          data.address,
          data.city,
          data.postalCode,
          data.country,
          data.lat,
          data.lng,
        );
      setVenueForm(emptyVenueForm);
      setEditingVenueId(null);
      setShowVenueModal(false);
    } catch (err) {
      setAddVenueError(err instanceof Error ? err.message : m.admin_error_add_venue());
    }
  }, [editingVenueId, onAdd, onUpdate, venueForm, venueFormIsValid]);

  const [confirmArchiveVenueId, setConfirmArchiveVenueId] = useState<string | null>(null);
  const [confirmDeleteVenueId, setConfirmDeleteVenueId] = useState<string | null>(null);

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
    if (
      !isRoomFormValid() ||
      typeof roomForm.widthM !== "number" ||
      typeof roomForm.lengthM !== "number"
    ) {
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
      capacity: tt.capacity,
      active: tt.active,
    });
    setAddTableTypeError(null);
    setShowTableTypeModal(true);
  }, []);

  const [tableTypeDimensionConfirm, setTableTypeDimensionConfirm] = useState<{
    tableCount: number;
    roomCount: number;
    payload: typeof emptyTableTypeForm & { widthM: number; lengthM: number };
    editingId: string;
  } | null>(null);
  const [confirmDeleteTableTypeId, setConfirmDeleteTableTypeId] = useState<string | null>(null);

  const commitSaveTableType = useCallback(
    async (
      payload: typeof emptyTableTypeForm & { widthM: number; lengthM: number },
      editingId: string | null,
    ) => {
      if (editingId) {
        const { active: _active, ...updateData } = payload;
        await onUpdateTableType(editingId, updateData);
      } else {
        await onAddTableType(payload);
      }
      setTableTypeForm(emptyTableTypeForm);
      setEditingTableTypeOriginalShape(null);
      setShowTableTypeModal(false);
    },
    [onAddTableType, onUpdateTableType],
  );

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
    if (tableTypeForm.capacity < 1 || !Number.isInteger(tableTypeForm.capacity)) {
      setAddTableTypeError(m.admin_table_type_capacity_min());
      return;
    }
    const { widthM, lengthM } = tableTypeForm;
    if (typeof widthM !== "number" || widthM <= 0 || typeof lengthM !== "number" || lengthM <= 0) {
      setAddTableTypeError(m.admin_table_type_dimensions_positive());
      return;
    }
    const payload = { ...tableTypeForm, widthM, lengthM };
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
      const affectedTableLayoutIds = tables
        .filter((t) => t.tableTypeId === editingTableTypeId)
        .map((t) => t.layoutId);
      const affectedRoomIds = new Set(
        affectedTableLayoutIds
          .map((layoutId) => layouts.find((l) => l.id === layoutId)?.roomId)
          .filter((roomId): roomId is string => Boolean(roomId)),
      );
      if (affectedTableLayoutIds.length > 0) {
        setTableTypeDimensionConfirm({
          tableCount: affectedTableLayoutIds.length,
          roomCount: affectedRoomIds.size,
          payload,
          editingId: editingTableTypeId,
        });
        return;
      }
    }
    setAddTableTypeError(null);
    try {
      await commitSaveTableType(payload, editingTableTypeId);
    } catch (err) {
      setAddTableTypeError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [
    tableTypeForm,
    editingTableTypeId,
    editingTableTypeOriginalShape,
    tables,
    layouts,
    commitSaveTableType,
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

  return (
    <Card bg="dark" text="white" border="secondary">
      <Card.Header className="d-flex align-items-center justify-content-between">
        <span className="fw-semibold">
          <i className="bi bi-geo-alt me-2" aria-hidden="true" />
          {m.admin_venue_add()}
        </span>
        <Button variant="outline-warning" size="sm" onClick={openAddVenue}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_venue_add()}
        </Button>
      </Card.Header>
      <Card.Body className="d-flex flex-column gap-3">
        {deleteVenueError && (
          <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-0 small">
            {deleteVenueError}
          </Alert>
        )}
        {deleteRoomError && (
          <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-0 small">
            {deleteRoomError}
          </Alert>
        )}
        {deleteTableTypeError && (
          <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-0 small">
            {deleteTableTypeError}
          </Alert>
        )}
        {venues.length === 0 ? (
          <p className="text-secondary text-center small my-3">
            <i className="bi bi-info-circle me-1" aria-hidden="true" />
            {m.admin_no_venues()}
          </p>
        ) : (
          venues.map((venue) => {
            const isArchived = !venue.active;
            const venueRooms = rooms.filter((r) => r.venueId === venue.id);
            const venueTableTypes = tableTypes.filter((tt) => tt.venueId === venue.id);
            const locationLine = [venue.address, venue.city, venue.postalCode, venue.country]
              .filter(Boolean)
              .join(", ");
            return (
              <Card
                key={venue.id}
                bg="dark"
                text="white"
                border="secondary"
                className={clsx(isArchived && "opacity-75")}
              >
                <Card.Header className="d-flex align-items-start justify-content-between gap-2">
                  <div>
                    <div className="fw-semibold">
                      {venue.name}
                      {isArchived && (
                        <Badge bg="secondary" className="ms-2 fs-2xs">
                          {m.admin_venue_archived_badge()}
                        </Badge>
                      )}
                    </div>
                    <div className="text-secondary small">{locationLine || "—"}</div>
                  </div>
                  <div className="d-flex gap-1 flex-shrink-0">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => openEditVenue(venue)}
                      aria-label={`${m.admin_edit()} ${venue.name}`}
                      title={m.admin_edit()}
                    >
                      <i className="bi bi-pencil" aria-hidden="true" />
                    </Button>
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
                          onClick={() => setConfirmDeleteVenueId(venue.id)}
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
                        onClick={() => setConfirmArchiveVenueId(venue.id)}
                        aria-label={m.admin_content_archive()}
                        title={m.admin_content_archive()}
                      >
                        <i className="bi bi-archive" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </Card.Header>
                {!isArchived && (
                  <Card.Body className="py-2">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="text-secondary small text-uppercase fw-semibold">
                        {m.admin_rooms_tab()}
                      </span>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => openAddRoom(venue.id)}
                      >
                        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                        {m.admin_room_add()}
                      </Button>
                    </div>
                    {venueRooms.length === 0 ? (
                      <p className="text-secondary small fst-italic mb-3">
                        {m.admin_room_no_rooms()}
                      </p>
                    ) : (
                      <ListGroup variant="flush" className="mb-3">
                        {venueRooms.map((room) => (
                          <ListGroup.Item
                            key={room.id}
                            className={clsx(
                              "bg-dark text-light border-secondary d-flex justify-content-between align-items-center gap-2 py-1 px-0",
                              !room.active && "opacity-50",
                            )}
                          >
                            <span className="d-flex align-items-center gap-2">
                              <span
                                aria-hidden="true"
                                style={{
                                  display: "inline-block",
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  background: room.color,
                                  flexShrink: 0,
                                }}
                              />
                              {room.name}
                              {room.dimensionsPlaceholder && (
                                <i
                                  className="bi bi-exclamation-triangle-fill fs-5xs text-warning"
                                  aria-label={m.admin_room_dimensions_placeholder_badge()}
                                  title={m.admin_room_dimensions_placeholder_hint()}
                                />
                              )}
                            </span>
                            <span className="d-flex gap-1 flex-shrink-0">
                              {room.active ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    onClick={() => openEditRoom(room)}
                                    aria-label={m.admin_edit()}
                                    title={m.admin_edit()}
                                  >
                                    <i className="bi bi-pencil" aria-hidden="true" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    onClick={() => handleArchiveRoom(room.id)}
                                    aria-label={m.admin_content_archive()}
                                    title={m.admin_content_archive()}
                                  >
                                    <i className="bi bi-archive" aria-hidden="true" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline-success"
                                    onClick={() => handleRestoreRoom(room.id)}
                                    aria-label={m.admin_content_restore()}
                                    title={m.admin_content_restore()}
                                  >
                                    <i
                                      className="bi bi-arrow-counterclockwise"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline-danger"
                                    onClick={() => handleDeleteRoom(room.id)}
                                    aria-label={`${m.admin_delete()} ${room.name}`}
                                    title={m.admin_delete()}
                                  >
                                    <i className="bi bi-trash" aria-hidden="true" />
                                  </Button>
                                </>
                              )}
                            </span>
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    )}

                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="text-secondary small text-uppercase fw-semibold">
                        {m.admin_table_types_tab()}
                      </span>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => openAddTableType(venue.id)}
                      >
                        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                        {m.admin_add_table_type()}
                      </Button>
                    </div>
                    {venueTableTypes.length === 0 ? (
                      <p className="text-secondary small fst-italic mb-0">
                        {m.admin_no_table_types()}
                      </p>
                    ) : (
                      <ListGroup variant="flush" className="mb-0">
                        {venueTableTypes.map((tt) => (
                          <ListGroup.Item
                            key={tt.id}
                            className={clsx(
                              "bg-dark text-light border-secondary d-flex justify-content-between align-items-center gap-2 py-1 px-0",
                              !tt.active && "opacity-50",
                            )}
                          >
                            <span className="d-flex align-items-center gap-2">
                              <i
                                className={tt.shape === "round" ? "bi bi-circle" : "bi bi-square"}
                                aria-hidden="true"
                              />
                              {tt.name}
                            </span>
                            <span className="d-flex gap-1 flex-shrink-0">
                              {tt.active ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    onClick={() => openEditTableType(tt)}
                                    aria-label={m.admin_edit()}
                                    title={m.admin_edit()}
                                  >
                                    <i className="bi bi-pencil" aria-hidden="true" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    onClick={() => handleArchiveTableType(tt.id)}
                                    aria-label={m.admin_content_archive()}
                                    title={m.admin_content_archive()}
                                  >
                                    <i className="bi bi-archive" aria-hidden="true" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline-success"
                                    onClick={() => handleRestoreTableType(tt.id)}
                                    aria-label={m.admin_content_restore()}
                                    title={m.admin_content_restore()}
                                  >
                                    <i
                                      className="bi bi-arrow-counterclockwise"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline-danger"
                                    onClick={() => setConfirmDeleteTableTypeId(tt.id)}
                                    aria-label={`${m.admin_delete()} ${tt.name}`}
                                    title={m.admin_delete()}
                                  >
                                    <i className="bi bi-trash" aria-hidden="true" />
                                  </Button>
                                </>
                              )}
                            </span>
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    )}
                  </Card.Body>
                )}
              </Card>
            );
          })
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
          <Modal.Title id="add-venue-modal-title">
            {editingVenueId ? `${m.admin_edit()} ${venueForm.name}` : m.admin_venue_add()}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addVenueError && (
            <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-3 small">
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
          <Form.Group className="mb-3" controlId="venue-country">
            <Form.Label>{m.admin_venue_country_label()}</Form.Label>
            <Form.Control
              type="text"
              value={venueForm.country}
              onChange={(e) => setVenueForm((p) => ({ ...p, country: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <div className="row g-2">
            <div className="col">
              <Form.Group controlId="venue-latitude">
                <Form.Label>{m.admin_venue_latitude_label()}</Form.Label>
                <Form.Control
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={venueForm.lat}
                  onChange={(e) =>
                    setVenueForm((p) => ({
                      ...p,
                      lat: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
            </div>
            <div className="col">
              <Form.Group controlId="venue-longitude">
                <Form.Label>{m.admin_venue_longitude_label()}</Form.Label>
                <Form.Control
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={venueForm.lng}
                  onChange={(e) =>
                    setVenueForm((p) => ({
                      ...p,
                      lng: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
            </div>
          </div>
          {previewCoordinates && (
            <div className="mt-3">
              <div className="text-secondary small mb-1">{m.admin_venue_map_preview()}</div>
              <Suspense
                fallback={
                  <div className="ratio ratio-16x9 rounded border border-secondary d-flex align-items-center justify-content-center">
                    {m.loading()}
                  </div>
                }
              >
                <MapComponent
                  location={venueForm.name}
                  address={venueForm.address}
                  city={venueForm.city}
                  postalCode={venueForm.postalCode}
                  country={venueForm.country}
                  coordinates={previewCoordinates}
                />
              </Suspense>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowVenueModal(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="warning" onClick={handleSaveVenue} disabled={!venueFormIsValid}>
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
            <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-3 small">
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
            <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-3 small">
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
            <Form.Label>{m.admin_table_type_name_label()}</Form.Label>
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
                  // Same reasoning as emptyTableTypeForm: a shape switch invalidates
                  // whatever dimensions were entered, and no generic replacement is
                  // defensible (#833/#835) — blank them rather than inventing values.
                  widthM: "",
                  lengthM: "",
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
                      setTableTypeForm((p) => ({ ...p, widthM: v }));
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
                      setTableTypeForm((p) => ({ ...p, lengthM: v }));
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
              value={tableTypeForm.capacity}
              onChange={(e) =>
                setTableTypeForm((p) => ({ ...p, capacity: Number(e.target.value) }))
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
              tableTypeForm.capacity < 1 ||
              !Number.isInteger(tableTypeForm.capacity) ||
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

      {confirmArchiveVenueId && (
        <ConfirmModal
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
          show
          title={m.admin_venue_delete_title()}
          body={m.admin_venue_delete_confirm()}
          errorFallback={m.admin_error_delete_venue()}
          onConfirm={() => onDelete(confirmDeleteVenueId)}
          onHide={() => setConfirmDeleteVenueId(null)}
        />
      )}
      {tableTypeDimensionConfirm && (
        <ConfirmModal
          show
          title={m.admin_table_type_dimension_change_title()}
          body={m.admin_table_type_dimension_change_confirm({
            tableCount: tableTypeDimensionConfirm.tableCount,
            roomCount: tableTypeDimensionConfirm.roomCount,
          })}
          variant="warning"
          icon="exclamation-triangle"
          confirmLabel={m.admin_action_confirm()}
          errorFallback={m.admin_content_error_save()}
          onConfirm={() =>
            commitSaveTableType(
              tableTypeDimensionConfirm.payload,
              tableTypeDimensionConfirm.editingId,
            )
          }
          onHide={() => setTableTypeDimensionConfirm(null)}
        />
      )}
      {confirmDeleteTableTypeId && (
        <ConfirmModal
          show
          title={m.admin_table_type_delete_title()}
          body={m.admin_table_type_delete_confirm()}
          errorFallback={m.admin_error_delete_table_type()}
          onConfirm={() => onDeleteTableType(confirmDeleteTableTypeId)}
          onHide={() => setConfirmDeleteTableTypeId(null)}
        />
      )}
    </Card>
  );
}

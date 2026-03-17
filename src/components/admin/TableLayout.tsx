/**
 * TableLayout — multi-room floor plan manager.
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
import { m } from "../../paraglide/messages";
import type { Reservation } from "../../types/reservation";
import type { Room, FloorTable } from "../../types/admin";

// How many CSS pixels represent one metre on the canvas
const PX_PER_M = 28;
// Minimum canvas width so small rooms are still usable
const MIN_CANVAS_PX = 280;
function getTableSize(table: FloorTable): { w: number; l: number } {
  return {
    w: Math.max(32, Math.round(table.widthM * PX_PER_M)),
    l: Math.max(32, Math.round(table.lengthM * PX_PER_M)),
  };
}

interface TableLayoutProps {
  tables: FloorTable[];
  reservations: Reservation[];
  rooms: Room[];
  onAddTable: (name: string, capacity: number, roomId: string | null, shape: "rectangle" | "round", widthM: number, lengthM: number, heightType: "low" | "high") => Promise<void>;
  onMoveTable: (tableId: string, x: number, y: number) => void;
  onDeleteTable: (tableId: string) => Promise<void>;
  onRotateTable: (tableId: string, rotation: number) => void;
  onAddRoom: (
    name: string,
    widthM: number,
    lengthM: number,
    color: string,
  ) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// DraggableTable
// ---------------------------------------------------------------------------

interface DraggableTableProps {
  table: FloorTable;
  assignedCount: number;
  isSelected: boolean;
  onClick: () => void;
  canvasW: number;
  canvasH: number;
}

function DraggableTable({
  table,
  assignedCount,
  isSelected,
  onClick,
  canvasW,
  canvasH,
}: DraggableTableProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: table.id,
  });

  const { w: TABLE_W, l: TABLE_L } = getTableSize(table);

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
        e.stopPropagation();
        onClick();
      }}
      className={`position-absolute d-flex flex-column align-items-center justify-content-center border text-center ${table.shape === "round" ? "rounded-circle" : "rounded"} ${borderCls} ${bgCls}`}
      style={{
        left: leftPx,
        top: topPx,
        width: TABLE_W,
        height: TABLE_L,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        transform: `${CSS.Translate.toString(transform)} rotate(${table.rotation}deg)`,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
        transition: isDragging ? undefined : "border-color 0.15s",
      }}
      title={`${table.name} — ${assignedCount}/${table.capacity}`}
      role="button"
      aria-pressed={isSelected}
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
// RoomCanvas — the drag target for one room
// ---------------------------------------------------------------------------

interface RoomCanvasProps {
  room: Room;
  roomTables: FloorTable[];
  reservations: Reservation[];
  selectedTable: string | null;
  onSelectTable: (id: string | null) => void;
  onMoveTable: (tableId: string, x: number, y: number) => void;
}

function RoomCanvas({
  room,
  roomTables,
  reservations,
  selectedTable,
  onSelectTable,
  onMoveTable,
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

      const table = roomTables.find((t) => t.id === active.id);
      if (!table) return;

      const { w: TABLE_W, l: TABLE_L } = getTableSize(table);

      // Current pixel position
      const leftPx = (table.x / 100) * canvasW + delta.x;
      const topPx = (table.y / 100) * canvasH + delta.y;

      // Clamp so table stays within canvas
      const clampedX = Math.min(Math.max(0, leftPx), canvasW - TABLE_W);
      const clampedY = Math.min(Math.max(0, topPx), canvasH - TABLE_L);

      const newX = (clampedX / canvasW) * 100;
      const newY = (clampedY / canvasH) * 100;

      onMoveTable(table.id as string, newX, newY);
    },
    [roomTables, canvasW, canvasH, onMoveTable],
  );

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
          onClick={() => onSelectTable(null)}
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
          {roomTables.length === 0 && (
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
            return (
              <DraggableTable
                key={table.id}
                table={table}
                assignedCount={assigned}
                isSelected={selectedTable === table.id}
                onClick={() => onSelectTable(selectedTable === table.id ? null : table.id)}
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
// TableLayout (main export)
// ---------------------------------------------------------------------------

export default function TableLayout({
  tables,
  reservations,
  rooms,
  onAddTable,
  onMoveTable,
  onDeleteTable,
  onRotateTable,
  onAddRoom,
  onDeleteRoom,
}: TableLayoutProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | "unassigned">("unassigned");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Switch to first room if there's one and we're on "unassigned" with no unassigned tables
  useEffect(() => {
    if (rooms.length > 0 && activeRoomId === "unassigned") {
      const unassigned = tables.filter((t) => !t.roomId);
      if (unassigned.length === 0) setActiveRoomId(rooms[0]?.id ?? "unassigned");
    }
  }, [rooms, tables, activeRoomId]);

  // Add Table modal
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTable, setNewTable] = useState({
    name: "", capacity: 4, roomId: "",
    shape: "rectangle" as "rectangle" | "round",
    widthM: 1.8, lengthM: 0.7,
    heightType: "low" as "low" | "high",
  });
  const [addTableError, setAddTableError] = useState<string | null>(null);

  // Add Room modal
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: "",
    widthM: 20,
    lengthM: 15,
    color: "#ffc107",
  });
  const [addRoomError, setAddRoomError] = useState<string | null>(null);
  const [deleteRoomError, setDeleteRoomError] = useState<string | null>(null);
  const [deleteTableError, setDeleteTableError] = useState<string | null>(null);

  const handleAddTable = useCallback(async () => {
    const widthM = Number(newTable.widthM);
    const lengthM = Number(newTable.lengthM);
    if (
      !newTable.name.trim() ||
      newTable.capacity < 1 ||
      !Number.isFinite(widthM) || widthM <= 0 ||
      !Number.isFinite(lengthM) || lengthM <= 0
    ) return;
    setAddTableError(null);
    try {
      await onAddTable(newTable.name.trim(), newTable.capacity, newTable.roomId || null, newTable.shape, widthM, lengthM, newTable.heightType);
      setNewTable({ name: "", capacity: 4, roomId: "", shape: "rectangle", widthM: 1.8, lengthM: 0.7, heightType: "low" });
      setShowAddTable(false);
    } catch (err) {
      console.error("Failed to add table", err);
      setAddTableError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [newTable, onAddTable]);

  const handleAddRoom = useCallback(async () => {
    if (
      !newRoom.name.trim() ||
      !Number.isFinite(newRoom.widthM) ||
      !Number.isFinite(newRoom.lengthM) ||
      newRoom.widthM < 1 ||
      newRoom.lengthM < 1
    ) {
      return;
    }
    setAddRoomError(null);
    try {
      await onAddRoom(
        newRoom.name.trim(),
        newRoom.widthM,
        newRoom.lengthM,
        newRoom.color,
      );
      setNewRoom({ name: "", widthM: 20, lengthM: 15, color: "#ffc107" });
      setShowAddRoom(false);
    } catch (err) {
      console.error("Failed to add room", err);
      setAddRoomError(m.admin_content_error_save());
    }
  }, [newRoom, onAddRoom]);

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      if (window.confirm(m.admin_room_delete_confirm())) {
        setDeleteRoomError(null);
        try {
          await onDeleteRoom(roomId);
          if (activeRoomId === roomId) setActiveRoomId("unassigned");
        } catch (err) {
          console.error("Failed to delete room", err);
          setDeleteRoomError(err instanceof Error ? err.message : m.admin_content_error_save());
        }
      }
    },
    [onDeleteRoom, activeRoomId],
  );

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

  const selectedTableData = tables.find((t) => t.id === selectedTable);
  const selectedReservations = selectedTableData
    ? reservations.filter((r) => selectedTableData.reservationIds.includes(r.id))
    : [];

  // Tables shown in the active canvas
  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const canvasTables =
    activeRoomId === "unassigned"
      ? tables.filter((t) => !t.roomId)
      : tables.filter((t) => t.roomId === activeRoomId);

  const handleSelectRoom = useCallback((k: string | null) => {
    if (k) {
      setActiveRoomId(k);
      setSelectedTable(null);
    }
  }, []);

  return (
    <div>
      {/* Tab bar: one tab per room + unassigned */}
      <Card bg="dark" text="white" border="secondary" className="mb-3">
        <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <Nav
            variant="pills"
            activeKey={activeRoomId}
            onSelect={handleSelectRoom}
            className="flex-wrap"
          >
            {rooms.map((room) => (
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
                    {tables.filter((t) => t.roomId === room.id).length}
                  </Badge>
                </Nav.Link>
              </Nav.Item>
            ))}
            <Nav.Item>
              <Nav.Link eventKey="unassigned" className="py-1 px-2 small text-light">
                <i className="bi bi-question-circle me-1" aria-hidden="true" />
                {m.admin_room_unassigned_tables()}
                <Badge bg="secondary" className="ms-1" style={{ fontSize: "0.6rem" }}>
                  {tables.filter((t) => !t.roomId).length}
                </Badge>
              </Nav.Link>
            </Nav.Item>
          </Nav>
          <div className="d-flex gap-2">
            <Button variant="outline-secondary" size="sm" onClick={() => { setAddRoomError(null); setShowAddRoom(true); }}>
              <i className="bi bi-building me-1" aria-hidden="true" />
              {m.admin_room_add()}
            </Button>
            <Button variant="outline-warning" size="sm" onClick={() => { setAddTableError(null); setShowAddTable(true); }}>
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              {m.admin_add_table()}
            </Button>
          </div>
        </Card.Header>

        <Card.Body className="p-2">
          {activeRoom ? (
            <div>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="fw-semibold" style={{ color: activeRoom.color }}>
                  <i className="bi bi-building me-1" aria-hidden="true" />
                  {activeRoom.name}
                </span>
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => handleDeleteRoom(activeRoom.id)}
                  title={m.admin_delete()}
                  aria-label={m.admin_delete()}
                >
                  <i className="bi bi-trash" aria-hidden="true" />
                </Button>
              </div>
              {deleteRoomError && (
                <Alert variant="danger" className="py-1 mb-2 small">{deleteRoomError}</Alert>
              )}
              <RoomCanvas
                room={activeRoom}
                roomTables={canvasTables}
                reservations={reservations}
                selectedTable={selectedTable}
                onSelectTable={setSelectedTable}
                onMoveTable={onMoveTable}
              />
            </div>
          ) : (
            // Unassigned canvas — shown when activeRoomId === "unassigned" or no rooms exist yet.
            // Always rendered so that tables with roomId === null remain visible and accessible.
            <div>
              {rooms.length === 0 && (
                <p className="text-secondary text-center small mb-2">
                  <i className="bi bi-info-circle me-1" aria-hidden="true" />
                  {m.admin_room_no_rooms()}
                </p>
              )}
              <RoomCanvas
                room={{
                  id: "unassigned",
                  name: m.admin_room_unassigned_tables(),
                  widthM: 30,
                  lengthM: 20,
                  color: "#6c757d",
                }}
                roomTables={canvasTables}
                reservations={reservations}
                selectedTable={selectedTable}
                onSelectTable={setSelectedTable}
                onMoveTable={onMoveTable}
              />
            </div>
          )}
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
              <Badge bg={selectedTableData.heightType === "high" ? "info" : "dark"} text={selectedTableData.heightType === "high" ? "dark" : "secondary"} className="border border-secondary">
                {selectedTableData.heightType === "high" ? m.admin_table_height_type_high() : m.admin_table_height_type_low()}
              </Badge>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => onRotateTable(selectedTableData.id, selectedTableData.rotation - 15)}
                title="Rotate 15° counter-clockwise"
                aria-label="Rotate 15° counter-clockwise"
              >
                <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
              </Button>
              <span className="text-secondary small" style={{ minWidth: "3.5rem", textAlign: "center" }}>
                {Math.round(selectedTableData.rotation)}°
              </span>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => onRotateTable(selectedTableData.id, selectedTableData.rotation + 15)}
                title="Rotate 15° clockwise"
                aria-label="Rotate 15° clockwise"
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
              <Alert variant="danger" className="py-1 mb-2 small">{deleteTableError}</Alert>
            )}
            {selectedReservations.length === 0 ? (
              <p className="text-secondary mb-0">{m.admin_unassigned()}</p>
            ) : (
              <ListGroup variant="flush">
                {selectedReservations.map((r) => (
                  <ListGroup.Item key={r.id} className="bg-dark text-light border-secondary">
                    <span className="fw-semibold">{r.name}</span>
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
            <Alert variant="danger" className="py-1 mb-3 small">{addTableError}</Alert>
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
          <Form.Group className="mb-3" controlId="table-shape">
            <Form.Label>{m.admin_table_shape_label()}</Form.Label>
            <Form.Select
              value={newTable.shape}
              onChange={(e) => {
                const s = e.target.value as "rectangle" | "round";
                setNewTable((p) => ({
                  ...p,
                  shape: s,
                  widthM: s === "round" ? 0.9 : 1.8,
                  lengthM: s === "round" ? 0.9 : 0.7,
                }));
              }}
              className="bg-dark text-light border-secondary"
            >
              <option value="rectangle">{m.admin_table_shape_rectangle()}</option>
              <option value="round">{m.admin_table_shape_round()}</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="table-height-type">
            <Form.Label>{m.admin_table_height_type_label()}</Form.Label>
            <Form.Select
              value={newTable.heightType}
              onChange={(e) => setNewTable((p) => ({ ...p, heightType: e.target.value as "low" | "high" }))}
              className="bg-dark text-light border-secondary"
            >
              <option value="low">{m.admin_table_height_type_low()}</option>
              <option value="high">{m.admin_table_height_type_high()}</option>
            </Form.Select>
          </Form.Group>
          {newTable.shape === "round" ? (
            <Form.Group className="mb-3" controlId="table-diameter">
              <Form.Label>{m.admin_table_diameter_label()}</Form.Label>
              <Form.Control
                type="number" min={0.1} max={20} step={0.1}
                value={newTable.widthM}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setNewTable((p) => ({ ...p, widthM: v, lengthM: v }));
                }}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
          ) : (
            <div className="row g-2 mb-3">
              <div className="col">
                <Form.Group controlId="table-width">
                  <Form.Label>{m.admin_table_width_label()}</Form.Label>
                  <Form.Control
                    type="number" min={0.1} max={20} step={0.1}
                    value={newTable.widthM}
                    onChange={(e) => { const v = Number(e.target.value); setNewTable((p) => v > p.lengthM ? { ...p, widthM: p.lengthM, lengthM: v } : { ...p, widthM: v }); }}
                    className="bg-dark text-light border-secondary"
                  />
                </Form.Group>
              </div>
              <div className="col">
                <Form.Group controlId="table-length">
                  <Form.Label>{m.admin_table_length_label()}</Form.Label>
                  <Form.Control
                    type="number" min={0.1} max={20} step={0.1}
                    value={newTable.lengthM}
                    onChange={(e) => { const v = Number(e.target.value); setNewTable((p) => v < p.widthM ? { ...p, lengthM: p.widthM, widthM: v } : { ...p, lengthM: v }); }}
                    className="bg-dark text-light border-secondary"
                  />
                </Form.Group>
              </div>
            </div>
          )}
          {rooms.length > 0 && (
            <Form.Group controlId="table-room">
              <Form.Label>{m.admin_table_room_label()}</Form.Label>
              <Form.Select
                value={newTable.roomId}
                onChange={(e) => setNewTable((p) => ({ ...p, roomId: e.target.value }))}
                className="bg-dark text-light border-secondary"
              >
                <option value="">— {m.admin_room_unassigned_tables()} —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowAddTable(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="warning"
            onClick={handleAddTable}
            disabled={!newTable.name.trim() || newTable.capacity < 1}
          >
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add Room Modal */}
      <Modal
        show={showAddRoom}
        onHide={() => setShowAddRoom(false)}
        centered
        aria-labelledby="add-room-modal-title"
      >
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="add-room-modal-title">{m.admin_room_add()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addRoomError && (
            <Alert variant="danger" className="py-1 mb-3 small">{addRoomError}</Alert>
          )}
          <Form.Group className="mb-3" controlId="room-name">
            <Form.Label>{m.admin_room_name_label()}</Form.Label>
            <Form.Control
              type="text"
              value={newRoom.name}
              onChange={(e) => setNewRoom((p) => ({ ...p, name: e.target.value }))}
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
                  value={newRoom.widthM}
                  onChange={(e) => setNewRoom((p) => ({ ...p, widthM: Number(e.target.value) }))}
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
            </div>
            <div className="col">
              <Form.Group controlId="room-height">
                <Form.Label>{m.admin_room_height_label()}</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={500}
                  value={newRoom.lengthM}
                  onChange={(e) => setNewRoom((p) => ({ ...p, lengthM: Number(e.target.value) }))}
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
                value={newRoom.color}
                onChange={(e) => setNewRoom((p) => ({ ...p, color: e.target.value }))}
                style={{ width: 48, height: 38, padding: 2 }}
              />
              <Form.Control
                type="text"
                value={newRoom.color}
                onChange={(e) => setNewRoom((p) => ({ ...p, color: e.target.value }))}
                className="bg-dark text-light border-secondary"
                style={{ fontFamily: "monospace" }}
              />
            </div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowAddRoom(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="warning"
            onClick={handleAddRoom}
            disabled={
              !newRoom.name.trim() ||
              !Number.isFinite(newRoom.widthM) ||
              !Number.isFinite(newRoom.lengthM) ||
              newRoom.widthM < 1 ||
              newRoom.lengthM < 1
            }
          >
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

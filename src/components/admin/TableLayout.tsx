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
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Nav from "react-bootstrap/Nav";
import { m } from "../../paraglide/messages";
import type { Reservation, Room, Table } from "../../types/reservation";

// How many CSS pixels represent one metre on the canvas
const PX_PER_M = 28;
// Minimum canvas width so small rooms are still usable
const MIN_CANVAS_PX = 280;

interface TableLayoutProps {
  tables: Table[];
  reservations: Reservation[];
  rooms: Room[];
  onAddTable: (name: string, capacity: number, roomId: string | null) => void;
  onMoveTable: (tableId: string, x: number, y: number) => void;
  onDeleteTable: (tableId: string) => void;
  onAddRoom: (name: string, zoneType: string, widthM: number, heightM: number, color: string) => void;
  onDeleteRoom: (roomId: string) => void;
}

// ---------------------------------------------------------------------------
// DraggableTable
// ---------------------------------------------------------------------------

interface DraggableTableProps {
  table: Table;
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

  const TABLE_W = 76;
  const TABLE_H = 64;

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
      className={`position-absolute d-flex flex-column align-items-center justify-content-center rounded border text-center ${borderCls} ${bgCls}`}
      style={{
        left: leftPx,
        top: topPx,
        width: TABLE_W,
        height: TABLE_H,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        transform: CSS.Translate.toString(transform),
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
  roomTables: Table[];
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
  const canvasH = Math.max(180, room.heightM * PX_PER_M);

  const canvasRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      if (!canvasRef.current) return;

      const table = roomTables.find((t) => t.id === active.id);
      if (!table) return;

      const TABLE_W = 76;
      const TABLE_H = 64;

      // Current pixel position
      const leftPx = (table.x / 100) * canvasW + delta.x;
      const topPx = (table.y / 100) * canvasH + delta.y;

      // Clamp so table stays within canvas
      const clampedX = Math.min(Math.max(0, leftPx), canvasW - TABLE_W);
      const clampedY = Math.min(Math.max(0, topPx), canvasH - TABLE_H);

      const newX = (clampedX / canvasW) * 100;
      const newY = (clampedY / canvasH) * 100;

      onMoveTable(table.id as string, newX, newY);
    },
    [roomTables, canvasW, canvasH, onMoveTable],
  );

  return (
    <div className="overflow-auto pb-2">
      <p className="text-secondary small mb-1">
        {room.widthM} m × {room.heightM} m
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
            const assigned = reservations.filter((r) =>
              table.reservationIds.includes(r.id),
            ).length;
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
  const [newTable, setNewTable] = useState({ name: "", capacity: 4, roomId: "" });

  // Add Room modal
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: "",
    zoneType: "main-hall",
    widthM: 20,
    heightM: 15,
    color: "#ffc107",
  });

  const handleAddTable = useCallback(() => {
    if (!newTable.name.trim() || newTable.capacity < 1) return;
    onAddTable(newTable.name.trim(), newTable.capacity, newTable.roomId || null);
    setNewTable({ name: "", capacity: 4, roomId: "" });
    setShowAddTable(false);
  }, [newTable, onAddTable]);

  const handleAddRoom = useCallback(() => {
    if (!newRoom.name.trim()) return;
    onAddRoom(newRoom.name.trim(), newRoom.zoneType, newRoom.widthM, newRoom.heightM, newRoom.color);
    setNewRoom({ name: "", zoneType: "main-hall", widthM: 20, heightM: 15, color: "#ffc107" });
    setShowAddRoom(false);
  }, [newRoom, onAddRoom]);

  const handleDeleteRoom = useCallback(
    (roomId: string) => {
      if (window.confirm(m.admin_room_delete_confirm())) {
        onDeleteRoom(roomId);
        if (activeRoomId === roomId) setActiveRoomId("unassigned");
      }
    },
    [onDeleteRoom, activeRoomId],
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
                    style={{ width: 10, height: 10, background: room.color, verticalAlign: "middle" }}
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
            <Button variant="outline-secondary" size="sm" onClick={() => setShowAddRoom(true)}>
              <i className="bi bi-building me-1" aria-hidden="true" />
              {m.admin_room_add()}
            </Button>
            <Button variant="outline-warning" size="sm" onClick={() => setShowAddTable(true)}>
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              {m.admin_add_table()}
            </Button>
          </div>
        </Card.Header>

        <Card.Body className="p-2">
          {rooms.length === 0 ? (
            <div className="text-secondary text-center py-4">
              <i className="bi bi-building display-4" aria-hidden="true" />
              <p className="mt-2">{m.admin_room_no_rooms()}</p>
            </div>
          ) : activeRoom ? (
            <div>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="fw-semibold" style={{ color: activeRoom.color }}>
                  <i className="bi bi-building me-1" aria-hidden="true" />
                  {activeRoom.name}
                  <Badge
                    bg="secondary"
                    className="ms-2 text-capitalize"
                    style={{ fontSize: "0.65rem" }}
                  >
                    {activeRoom.zoneType === "main-hall"
                      ? m.admin_room_main_hall()
                      : m.admin_room_exchange()}
                  </Badge>
                </span>
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => handleDeleteRoom(activeRoom.id)}
                  title={m.admin_delete()}
                >
                  <i className="bi bi-trash" aria-hidden="true" />
                </Button>
              </div>
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
            // Unassigned canvas uses a generic virtual room
            <RoomCanvas
              room={{
                id: "unassigned",
                name: m.admin_room_unassigned_tables(),
                zoneType: "main-hall",
                widthM: 30,
                heightM: 20,
                color: "#6c757d",
              }}
              roomTables={canvasTables}
              reservations={reservations}
              selectedTable={selectedTable}
              onSelectTable={setSelectedTable}
              onMoveTable={onMoveTable}
            />
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
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => {
                  onDeleteTable(selectedTableData.id);
                  setSelectedTable(null);
                }}
                title={m.admin_delete()}
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
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
          <Form.Group className="mb-3" controlId="table-name">
            <Form.Label>{m.admin_table_name()}</Form.Label>
            <Form.Control
              type="text"
              value={newTable.name}
              onChange={(e) => setNewTable((p) => ({ ...p, name: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder="Table A, VIP 1…"
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="table-capacity">
            <Form.Label>{m.admin_table_capacity()}</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={50}
              value={newTable.capacity}
              onChange={(e) =>
                setNewTable((p) => ({ ...p, capacity: Number(e.target.value) }))
              }
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
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
          <Form.Group className="mb-3" controlId="room-zone-type">
            <Form.Label>{m.admin_room_zone_type_label()}</Form.Label>
            <Form.Select
              value={newRoom.zoneType}
              onChange={(e) => setNewRoom((p) => ({ ...p, zoneType: e.target.value }))}
              className="bg-dark text-light border-secondary"
            >
              <option value="main-hall">{m.admin_room_main_hall()}</option>
              <option value="exchange">{m.admin_room_exchange()}</option>
            </Form.Select>
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
                  onChange={(e) =>
                    setNewRoom((p) => ({ ...p, widthM: Number(e.target.value) }))
                  }
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
                  value={newRoom.heightM}
                  onChange={(e) =>
                    setNewRoom((p) => ({ ...p, heightM: Number(e.target.value) }))
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
            disabled={!newRoom.name.trim()}
          >
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

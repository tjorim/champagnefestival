import React, { useState, useCallback, useRef } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Badge from "react-bootstrap/Badge";
import { m } from "../../paraglide/messages";
import type { Table, Reservation } from "../../types/reservation";

interface TableLayoutProps {
  tables: Table[];
  reservations: Reservation[];
  onAddTable: (name: string, capacity: number) => void;
  onMoveTable: (tableId: string, x: number, y: number) => void;
  onDeleteTable: (tableId: string) => void;
}

interface NewTableForm {
  name: string;
  capacity: number;
}

export default function TableLayout({
  tables,
  reservations,
  onAddTable,
  onMoveTable,
  onDeleteTable,
}: TableLayoutProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTable, setNewTable] = useState<NewTableForm>({ name: "", capacity: 4 });
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const hallRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleAddTable = useCallback(() => {
    if (!newTable.name.trim() || newTable.capacity < 1) return;
    onAddTable(newTable.name.trim(), newTable.capacity);
    setNewTable({ name: "", capacity: 4 });
    setShowAddModal(false);
  }, [newTable, onAddTable]);

  /** Convert pixel coords relative to hall div to percentage values */
  const pxToPercent = useCallback((px: number, py: number): { x: number; y: number } => {
    const hall = hallRef.current;
    if (!hall) return { x: 0, y: 0 };
    const rect = hall.getBoundingClientRect();
    const x = Math.min(Math.max(0, ((px - rect.left) / rect.width) * 100), 95);
    const y = Math.min(Math.max(0, ((py - rect.top) / rect.height) * 100), 90);
    return { x, y };
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, tableId: string, tableX: number, tableY: number) => {
      const hall = hallRef.current;
      if (!hall) return;
      const rect = hall.getBoundingClientRect();
      const tablePxX = (tableX / 100) * rect.width + rect.left;
      const tablePxY = (tableY / 100) * rect.height + rect.top;
      dragOffset.current = { x: e.clientX - tablePxX, y: e.clientY - tablePxY };
      setDraggingId(tableId);
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!draggingId) return;
      const { x, y } = pxToPercent(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
      );
      onMoveTable(draggingId, x, y);
      setDraggingId(null);
    },
    [draggingId, pxToPercent, onMoveTable],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const selectedTableData = tables.find((t) => t.id === selectedTable);
  const selectedReservations = selectedTableData
    ? reservations.filter((r) => selectedTableData.reservationIds.includes(r.id))
    : [];

  return (
    <div>
      {/* Hall canvas */}
      <Card bg="dark" text="white" border="secondary" className="mb-3">
        <Card.Header className="d-flex align-items-center justify-content-between">
          <span className="fw-semibold">
            <i className="bi bi-grid-3x3-gap me-2" aria-hidden="true" />
            {m.admin_hall_title()}
          </span>
          <Button variant="outline-warning" size="sm" onClick={() => setShowAddModal(true)}>
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            {m.admin_add_table()}
          </Button>
        </Card.Header>

        <Card.Body className="p-2">
          <div
            ref={hallRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="position-relative border border-secondary rounded"
            style={{
              height: "420px",
              background: "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.05) 39px, rgba(255,255,255,0.05) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.05) 39px, rgba(255,255,255,0.05) 40px)",
              overflow: "hidden",
              cursor: "crosshair",
            }}
            aria-label={m.admin_hall_title()}
          >
            {tables.length === 0 && (
              <div
                className="position-absolute top-50 start-50 translate-middle text-secondary text-center"
                style={{ pointerEvents: "none" }}
              >
                <i className="bi bi-grid-3x3-gap display-4" aria-hidden="true" />
                <p className="mt-2">{m.admin_no_tables()}</p>
              </div>
            )}

            {tables.map((table) => {
              const assignedCount = table.reservationIds.length;
              const isFull = assignedCount > 0 && table.capacity <= assignedCount;
              const isSelected = selectedTable === table.id;
              return (
                <div
                  key={table.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, table.id, table.x, table.y)}
                  onClick={() => setSelectedTable(isSelected ? null : table.id)}
                  className={`position-absolute d-flex flex-column align-items-center justify-content-center rounded border text-center ${
                    isSelected
                      ? "border-warning bg-warning bg-opacity-25 text-warning"
                      : isFull
                        ? "border-danger bg-danger bg-opacity-10 text-danger"
                        : assignedCount > 0
                          ? "border-success bg-success bg-opacity-10 text-success"
                          : "border-secondary bg-dark text-secondary"
                  }`}
                  style={{
                    left: `${table.x}%`,
                    top: `${table.y}%`,
                    width: "80px",
                    height: "70px",
                    cursor: "grab",
                    userSelect: "none",
                    transition: "border-color 0.15s",
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
            })}
          </div>
          <p className="text-secondary small mt-1 mb-0">
            <i className="bi bi-info-circle me-1" aria-hidden="true" />
            {m.admin_drag_info()}
          </p>
        </Card.Body>
      </Card>

      {/* Selected table details */}
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
              <ul className="list-unstyled mb-0">
                {selectedReservations.map((r) => (
                  <li key={r.id} className="mb-1">
                    <span className="fw-semibold">{r.name}</span>
                    <span className="text-secondary ms-2 small">({r.guestCount} {m.admin_guests_count()})</span>
                  </li>
                ))}
              </ul>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Add Table Modal */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered aria-labelledby="add-table-modal-title">
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="add-table-modal-title">{m.admin_add_table()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          <Form.Group className="mb-3" controlId="table-name">
            <Form.Label>{m.admin_table_name()}</Form.Label>
            <Form.Control
              type="text"
              value={newTable.name}
              onChange={(e) => setNewTable((prev) => ({ ...prev, name: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder="Table A, VIP 1…"
            />
          </Form.Group>
          <Form.Group controlId="table-capacity">
            <Form.Label>{m.admin_table_capacity()}</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={50}
              value={newTable.capacity}
              onChange={(e) =>
                setNewTable((prev) => ({ ...prev, capacity: Number(e.target.value) }))
              }
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>
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
    </div>
  );
}

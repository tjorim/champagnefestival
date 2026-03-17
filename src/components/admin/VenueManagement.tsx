/**
 * VenueManagement — CRUD for venues and their rooms.
 *
 * Managers define venues and rooms here. The LayoutEditor then uses rooms as
 * navigation tabs when organising floor plans.
 */

import { useCallback, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Table from "react-bootstrap/Table";
import { m } from "../../paraglide/messages";
import type { Room, Venue } from "../../types/admin";

interface VenueManagementProps {
  venues: Venue[];
  rooms: Room[];
  onAdd: (name: string, address: string, city: string, postalCode: string, country: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddRoom: (venueId: string, name: string, widthM: number, lengthM: number, color: string) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
}

const emptyVenueForm = { name: "", address: "", city: "", postalCode: "", country: "" };
const emptyRoomForm = { name: "", widthM: 20, lengthM: 15, color: "#ffc107" };

export default function VenueManagement({ venues, rooms, onAdd, onDelete, onAddRoom, onDeleteRoom }: VenueManagementProps) {
  // Venue add
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [venueForm, setVenueForm] = useState(emptyVenueForm);
  const [addVenueError, setAddVenueError] = useState<string | null>(null);
  const [deleteVenueError, setDeleteVenueError] = useState<string | null>(null);

  // Room add
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomVenueId, setRoomVenueId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [addRoomError, setAddRoomError] = useState<string | null>(null);
  const [deleteRoomError, setDeleteRoomError] = useState<string | null>(null);

  const handleAddVenue = useCallback(async () => {
    if (!venueForm.name.trim()) return;
    setAddVenueError(null);
    try {
      await onAdd(venueForm.name.trim(), venueForm.address.trim(), venueForm.city.trim(), venueForm.postalCode.trim(), venueForm.country.trim());
      setVenueForm(emptyVenueForm);
      setShowVenueModal(false);
    } catch (err) {
      setAddVenueError(err instanceof Error ? err.message : m.admin_error_add_venue());
    }
  }, [venueForm, onAdd]);

  const handleDeleteVenue = useCallback(async (id: string) => {
    if (!window.confirm(m.admin_venue_delete_confirm())) return;
    setDeleteVenueError(null);
    try {
      await onDelete(id);
    } catch (err) {
      setDeleteVenueError(err instanceof Error ? err.message : m.admin_error_delete_venue());
    }
  }, [onDelete]);

  const openAddRoom = useCallback((venueId: string) => {
    setRoomVenueId(venueId);
    setRoomForm(emptyRoomForm);
    setAddRoomError(null);
    setShowRoomModal(true);
  }, []);

  const handleAddRoom = useCallback(async () => {
    if (!roomVenueId || !roomForm.name.trim() || roomForm.widthM < 1 || roomForm.lengthM < 1) return;
    setAddRoomError(null);
    try {
      await onAddRoom(roomVenueId, roomForm.name.trim(), roomForm.widthM, roomForm.lengthM, roomForm.color);
      setRoomForm(emptyRoomForm);
      setShowRoomModal(false);
    } catch (err) {
      setAddRoomError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [roomVenueId, roomForm, onAddRoom]);

  const handleDeleteRoom = useCallback(async (roomId: string) => {
    if (!window.confirm(m.admin_room_delete_confirm())) return;
    setDeleteRoomError(null);
    try {
      await onDeleteRoom(roomId);
    } catch (err) {
      setDeleteRoomError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [onDeleteRoom]);

  return (
    <Card bg="dark" text="white" border="secondary">
      <Card.Header className="d-flex align-items-center justify-content-between">
        <span className="fw-semibold">
          <i className="bi bi-geo-alt me-2" aria-hidden="true" />
          {m.admin_venue_add()}
        </span>
        <Button variant="outline-warning" size="sm" onClick={() => { setAddVenueError(null); setShowVenueModal(true); }}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_venue_add()}
        </Button>
      </Card.Header>
      <Card.Body className="p-0">
        {deleteVenueError && <Alert variant="danger" className="m-2 py-1 small">{deleteVenueError}</Alert>}
        {deleteRoomError && <Alert variant="danger" className="m-2 py-1 small">{deleteRoomError}</Alert>}
        {venues.length === 0 ? (
          <p className="text-secondary text-center small my-3">
            <i className="bi bi-info-circle me-1" aria-hidden="true" />
            {m.admin_no_venues()}
          </p>
        ) : (
          <Table variant="dark" hover responsive className="mb-0 small">
            <thead>
              <tr>
                <th>{m.admin_venue_name_label()}</th>
                <th>{m.admin_venue_address_label()}</th>
                <th>{m.admin_venue_city_label()}</th>
                <th>{m.admin_venue_postal_code_label()}</th>
                <th>{m.admin_venue_country_label()}</th>
                <th>{m.admin_room_name_label()}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {venues.map((venue) => {
                const venueRooms = rooms.filter((r) => r.venueId === venue.id);
                return (
                  <tr key={venue.id}>
                    <td className="fw-semibold">{venue.name}</td>
                    <td className="text-secondary">{venue.address || "—"}</td>
                    <td className="text-secondary">{venue.city || "—"}</td>
                    <td className="text-secondary">{venue.postalCode || "—"}</td>
                    <td className="text-secondary">{venue.country || "—"}</td>
                    <td>
                      <div className="d-flex flex-wrap gap-1 align-items-center">
                        {venueRooms.map((room) => (
                          <Badge
                            key={room.id}
                            style={{ background: room.color, color: "#fff", fontSize: "0.75rem" }}
                            className="d-inline-flex align-items-center gap-1"
                          >
                            {room.name}
                            <button
                              type="button"
                              className="btn-close btn-close-white"
                              style={{ fontSize: "0.55rem" }}
                              onClick={() => handleDeleteRoom(room.id)}
                              aria-label={m.admin_delete()}
                            />
                          </Badge>
                        ))}
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          className="py-0 px-1"
                          style={{ fontSize: "0.7rem" }}
                          onClick={() => openAddRoom(venue.id)}
                        >
                          <i className="bi bi-plus-lg" aria-hidden="true" />
                          {m.admin_room_add()}
                        </Button>
                      </div>
                    </td>
                    <td className="text-end">
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => handleDeleteVenue(venue.id)}
                        aria-label={m.admin_delete()}
                      >
                        <i className="bi bi-trash" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card.Body>

      {/* Add Venue Modal */}
      <Modal show={showVenueModal} onHide={() => setShowVenueModal(false)} centered aria-labelledby="add-venue-modal-title">
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="add-venue-modal-title">{m.admin_venue_add()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addVenueError && <Alert variant="danger" className="py-1 mb-3 small">{addVenueError}</Alert>}
          <Form.Group className="mb-3" controlId="venue-name">
            <Form.Label>{m.admin_venue_name_label()}</Form.Label>
            <Form.Control type="text" value={venueForm.name} onChange={(e) => setVenueForm((p) => ({ ...p, name: e.target.value }))} className="bg-dark text-light border-secondary" placeholder={m.admin_venue_name_placeholder()} />
          </Form.Group>
          <Form.Group className="mb-3" controlId="venue-address">
            <Form.Label>{m.admin_venue_address_label()}</Form.Label>
            <Form.Control type="text" value={venueForm.address} onChange={(e) => setVenueForm((p) => ({ ...p, address: e.target.value }))} className="bg-dark text-light border-secondary" />
          </Form.Group>
          <div className="row g-2 mb-3">
            <div className="col">
              <Form.Group controlId="venue-city">
                <Form.Label>{m.admin_venue_city_label()}</Form.Label>
                <Form.Control type="text" value={venueForm.city} onChange={(e) => setVenueForm((p) => ({ ...p, city: e.target.value }))} className="bg-dark text-light border-secondary" />
              </Form.Group>
            </div>
            <div className="col-auto">
              <Form.Group controlId="venue-postal-code">
                <Form.Label>{m.admin_venue_postal_code_label()}</Form.Label>
                <Form.Control type="text" value={venueForm.postalCode} onChange={(e) => setVenueForm((p) => ({ ...p, postalCode: e.target.value }))} className="bg-dark text-light border-secondary" style={{ width: "7rem" }} />
              </Form.Group>
            </div>
          </div>
          <Form.Group controlId="venue-country">
            <Form.Label>{m.admin_venue_country_label()}</Form.Label>
            <Form.Control type="text" value={venueForm.country} onChange={(e) => setVenueForm((p) => ({ ...p, country: e.target.value }))} className="bg-dark text-light border-secondary" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowVenueModal(false)}>{m.admin_action_cancel()}</Button>
          <Button variant="warning" onClick={handleAddVenue} disabled={!venueForm.name.trim()}>{m.admin_save()}</Button>
        </Modal.Footer>
      </Modal>

      {/* Add Room Modal */}
      <Modal show={showRoomModal} onHide={() => setShowRoomModal(false)} centered aria-labelledby="add-room-modal-title">
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="add-room-modal-title">{m.admin_room_add()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {addRoomError && <Alert variant="danger" className="py-1 mb-3 small">{addRoomError}</Alert>}
          <Form.Group className="mb-3" controlId="room-name">
            <Form.Label>{m.admin_room_name_label()}</Form.Label>
            <Form.Control type="text" value={roomForm.name} onChange={(e) => setRoomForm((p) => ({ ...p, name: e.target.value }))} className="bg-dark text-light border-secondary" placeholder={m.admin_room_name_placeholder()} />
          </Form.Group>
          <div className="row g-2 mb-3">
            <div className="col">
              <Form.Group controlId="room-width">
                <Form.Label>{m.admin_room_width_label()}</Form.Label>
                <Form.Control type="number" min={1} max={500} value={roomForm.widthM} onChange={(e) => setRoomForm((p) => ({ ...p, widthM: Number(e.target.value) }))} className="bg-dark text-light border-secondary" />
              </Form.Group>
            </div>
            <div className="col">
              <Form.Group controlId="room-height">
                <Form.Label>{m.admin_room_height_label()}</Form.Label>
                <Form.Control type="number" min={1} max={500} value={roomForm.lengthM} onChange={(e) => setRoomForm((p) => ({ ...p, lengthM: Number(e.target.value) }))} className="bg-dark text-light border-secondary" />
              </Form.Group>
            </div>
          </div>
          <Form.Group controlId="room-color">
            <Form.Label>{m.admin_room_color_label()}</Form.Label>
            <div className="d-flex gap-2 align-items-center">
              <Form.Control type="color" value={roomForm.color} onChange={(e) => setRoomForm((p) => ({ ...p, color: e.target.value }))} style={{ width: 48, height: 38, padding: 2 }} />
              <Form.Control type="text" value={roomForm.color} onChange={(e) => setRoomForm((p) => ({ ...p, color: e.target.value }))} className="bg-dark text-light border-secondary" style={{ fontFamily: "monospace" }} />
            </div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowRoomModal(false)}>{m.admin_action_cancel()}</Button>
          <Button variant="warning" onClick={handleAddRoom} disabled={!roomForm.name.trim() || roomForm.widthM < 1 || roomForm.lengthM < 1}>{m.admin_save()}</Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
}

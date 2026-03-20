import React, { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";

interface PersonFormModalProps {
  show: boolean;
  person: Person | null;
  onSave: (data: PersonFormData) => Promise<void>;
  onHide: () => void;
}

export interface PersonFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  roles: string[];
  notes: string;
  clubName: string;
  active: boolean;
}

const KNOWN_ROLES = ["member", "volunteer", "visitor", "admin"];

export default function PersonFormModal({
  show,
  person,
  onSave,
  onHide,
}: PersonFormModalProps) {
  const isEdit = person != null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [rolesInput, setRolesInput] = useState("");
  const [notes, setNotes] = useState("");
  const [clubName, setClubName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    if (person) {
      setName(person.name);
      setEmail(person.email ?? "");
      setPhone(person.phone ?? "");
      setAddress(person.address ?? "");
      setRolesInput(person.roles.join(", "));
      setNotes(person.notes ?? "");
      setClubName(person.clubName ?? "");
      setActive(person.active);
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
      setRolesInput("");
      setNotes("");
      setClubName("");
      setActive(true);
    }
    setError(null);
    setSaving(false);
  }, [show, person]);

  function parseRoles(raw: string): string[] {
    return raw
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        roles: parseRoles(rolesInput),
        notes: notes.trim(),
        clubName: clubName.trim(),
        active,
      });
      onHide();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEdit
          ? m.admin_people_error_update()
          : m.admin_people_error_create(),
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(role: string) {
    const current = parseRoles(rolesInput);
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    setRolesInput(next.join(", "));
  }

  const currentRoles = parseRoles(rolesInput);

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          <i className="bi bi-person-plus me-2" aria-hidden="true" />
          {isEdit ? m.admin_people_edit_title() : m.admin_people_create_title()}
        </Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit}>
        <Modal.Body className="bg-dark">
          {error && (
            <Alert
              variant="danger"
              className="py-2 small"
              dismissible
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}

          <Form.Group className="mb-3" controlId="person-name">
            <Form.Label className="text-secondary small">
              {m.reservation_name()} *
            </Form.Label>
            <Form.Control
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-dark text-light border-secondary"
              required
              maxLength={200}
            />
          </Form.Group>

          <Row className="mb-3">
            <Col xs={12} md={6}>
              <Form.Group controlId="person-email">
                <Form.Label className="text-secondary small">
                  {m.reservation_email()}
                </Form.Label>
                <Form.Control
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  maxLength={200}
                />
              </Form.Group>
            </Col>
            <Col xs={12} md={6}>
              <Form.Group controlId="person-phone">
                <Form.Label className="text-secondary small">
                  {m.reservation_phone()}
                </Form.Label>
                <Form.Control
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  maxLength={50}
                />
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3" controlId="person-address">
            <Form.Label className="text-secondary small">
              {m.admin_people_address_label()}
            </Form.Label>
            <Form.Control
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-dark text-light border-secondary"
              maxLength={300}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="person-club">
            <Form.Label className="text-secondary small">
              {m.admin_people_club_name_label()}
            </Form.Label>
            <Form.Control
              type="text"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              className="bg-dark text-light border-secondary"
              maxLength={200}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">
              {m.admin_people_roles_label()}
            </Form.Label>
            <div className="d-flex flex-wrap gap-2 mb-2">
              {KNOWN_ROLES.map((role) => (
                <Button
                  key={role}
                  size="sm"
                  variant={currentRoles.includes(role) ? "warning" : "outline-secondary"}
                  onClick={() => toggleRole(role)}
                  type="button"
                  className="text-capitalize"
                >
                  {role}
                </Button>
              ))}
            </div>
            <Form.Control
              type="text"
              value={rolesInput}
              onChange={(e) => setRolesInput(e.target.value)}
              className="bg-dark text-light border-secondary"
              placeholder="member, volunteer, ..."
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="person-notes">
            <Form.Label className="text-secondary small">
              {m.admin_notes()}
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-dark text-light border-secondary"
              maxLength={2000}
            />
          </Form.Group>

          <Form.Check
            id="person-active"
            type="switch"
            label={m.admin_people_active_label()}
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="text-secondary small"
          />
        </Modal.Body>

        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            type="submit"
            variant="warning"
            size="sm"
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <Spinner as="span" animation="border" size="sm" className="me-1" />
            ) : (
              <i className="bi bi-floppy me-1" aria-hidden="true" />
            )}
            {m.admin_people_save()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

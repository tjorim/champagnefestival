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

interface MemberFormModalProps {
  show: boolean;
  member: Person | null;
  onSave: (data: MemberFormData) => Promise<void>;
  onHide: () => void;
}

export interface MemberFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  clubName: string;
  notes: string;
  active: boolean;
}

export default function MemberFormModal({
  show,
  member,
  onSave,
  onHide,
}: MemberFormModalProps) {
  const isEdit = member != null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [clubName, setClubName] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    if (member) {
      setName(member.name);
      setEmail(member.email ?? "");
      setPhone(member.phone ?? "");
      setAddress(member.address ?? "");
      setClubName(member.clubName ?? "");
      setNotes(member.notes ?? "");
      setActive(member.active);
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
      setClubName("");
      setNotes("");
      setActive(true);
    }
    setError(null);
    setSaving(false);
  }, [show, member]);

  useEffect(() => {
    setError(null);
  }, [name, email, phone, address, clubName, notes, active]);

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
        clubName: clubName.trim(),
        notes: notes.trim(),
        active,
      });
      onHide();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEdit
            ? m.admin_members_error_update()
            : m.admin_members_error_create(),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          <i className="bi bi-person-badge me-2" aria-hidden="true" />
          {isEdit ? m.admin_members_edit_title() : m.admin_members_create_title()}
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

          <Form.Group className="mb-3" controlId="member-name">
            <Form.Label className="text-secondary small">{m.registration_name()} *</Form.Label>
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
              <Form.Group controlId="member-email">
                <Form.Label className="text-secondary small">{m.registration_email()}</Form.Label>
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
              <Form.Group controlId="member-phone">
                <Form.Label className="text-secondary small">{m.registration_phone()}</Form.Label>
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

          <Form.Group className="mb-3" controlId="member-club">
            <Form.Label className="text-secondary small fw-semibold text-warning-emphasis">
              {m.admin_people_club_name_label()}
            </Form.Label>
            <Form.Control
              type="text"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              className="bg-dark text-light border-secondary border-warning"
              maxLength={200}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="member-address">
            <Form.Label className="text-secondary small">{m.admin_people_address_label()}</Form.Label>
            <Form.Control
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-dark text-light border-secondary"
              maxLength={300}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="member-notes">
            <Form.Label className="text-secondary small">{m.registration_notes()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-dark text-light border-secondary"
              maxLength={2000}
            />
          </Form.Group>

          <Form.Check
            type="switch"
            id="member-active"
            className="text-secondary"
            label={m.admin_people_active_label()}
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
        </Modal.Body>

        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" onClick={onHide} disabled={saving}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="warning" type="submit" disabled={saving || !name.trim()}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                {m.admin_save()}
              </>
            ) : (
              <>
                <i className="bi bi-check2-circle me-1" aria-hidden="true" />
                {m.admin_people_save()}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

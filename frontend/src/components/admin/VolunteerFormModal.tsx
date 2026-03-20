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

interface VolunteerFormModalProps {
  show: boolean;
  volunteer: Person | null;
  onSave: (data: VolunteerFormData) => Promise<void>;
  onHide: () => void;
}

export interface VolunteerFormData {
  name: string;
  address: string;
  nationalRegisterNumber: string;
  eidDocumentNumber: string;
  firstHelpDay: string;
  lastHelpDay: string;
  active: boolean;
}

export default function VolunteerFormModal({
  show,
  volunteer,
  onSave,
  onHide,
}: VolunteerFormModalProps) {
  const isEdit = volunteer != null;

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [nationalRegisterNumber, setNationalRegisterNumber] = useState("");
  const [eidDocumentNumber, setEidDocumentNumber] = useState("");
  const [firstHelpDay, setFirstHelpDay] = useState("");
  const [lastHelpDay, setLastHelpDay] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    if (volunteer) {
      setName(volunteer.name);
      setAddress(volunteer.address ?? "");
      setNationalRegisterNumber(volunteer.nationalRegisterNumber ?? "");
      setEidDocumentNumber(volunteer.eidDocumentNumber ?? "");
      setFirstHelpDay(volunteer.firstHelpDay ?? "");
      setLastHelpDay(volunteer.lastHelpDay ?? "");
      setActive(volunteer.active);
    } else {
      setName("");
      setAddress("");
      setNationalRegisterNumber("");
      setEidDocumentNumber("");
      setFirstHelpDay("");
      setLastHelpDay("");
      setActive(true);
    }
    setError(null);
    setSaving(false);
  }, [show, volunteer]);

  useEffect(() => {
    setError(null);
  }, [name, address, nationalRegisterNumber, eidDocumentNumber, firstHelpDay, lastHelpDay, active]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !name.trim() ||
      !nationalRegisterNumber.trim() ||
      !eidDocumentNumber.trim() ||
      !firstHelpDay ||
      !lastHelpDay
    ) {
      return;
    }
    if (firstHelpDay > lastHelpDay) {
      setError(m.admin_volunteers_validation_help_day_range());
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        address: address.trim(),
        nationalRegisterNumber: nationalRegisterNumber.trim(),
        eidDocumentNumber: eidDocumentNumber.trim(),
        firstHelpDay,
        lastHelpDay,
        active,
      });
      onHide();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEdit
            ? m.admin_volunteers_error_update()
            : m.admin_volunteers_error_create(),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          <i className="bi bi-hand-thumbs-up me-2" aria-hidden="true" />
          {isEdit ? m.admin_volunteers_edit_title() : m.admin_volunteers_create_title()}
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

          <Form.Group className="mb-3" controlId="volunteer-name">
            <Form.Label className="text-secondary small">{m.reservation_name()} *</Form.Label>
            <Form.Control
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-dark text-light border-secondary"
              required
              maxLength={200}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="volunteer-address">
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

          <Row className="mb-3">
            <Col xs={12} md={6}>
              <Form.Group controlId="volunteer-national-register-number">
                <Form.Label className="text-secondary small">
                  {m.admin_people_national_register_number_label()} *
                </Form.Label>
                <Form.Control
                  type="text"
                  value={nationalRegisterNumber}
                  onChange={(e) => setNationalRegisterNumber(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  required
                  maxLength={50}
                />
              </Form.Group>
            </Col>
            <Col xs={12} md={6}>
              <Form.Group controlId="volunteer-eid-document-number">
                <Form.Label className="text-secondary small">
                  {m.admin_people_eid_document_number_label()} *
                </Form.Label>
                <Form.Control
                  type="text"
                  value={eidDocumentNumber}
                  onChange={(e) => setEidDocumentNumber(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  required
                  maxLength={50}
                />
              </Form.Group>
            </Col>
          </Row>

          <Row className="mb-3">
            <Col xs={12} md={6}>
              <Form.Group controlId="volunteer-first-help-day">
                <Form.Label className="text-secondary small">
                  {m.admin_people_first_help_day_label()} *
                </Form.Label>
                <Form.Control
                  type="date"
                  value={firstHelpDay}
                  onChange={(e) => setFirstHelpDay(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  required
                />
              </Form.Group>
            </Col>
            <Col xs={12} md={6}>
              <Form.Group controlId="volunteer-last-help-day">
                <Form.Label className="text-secondary small">
                  {m.admin_people_last_help_day_label()} *
                </Form.Label>
                <Form.Control
                  type="date"
                  value={lastHelpDay}
                  onChange={(e) => setLastHelpDay(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  required
                />
              </Form.Group>
            </Col>
          </Row>

          <Form.Check
            id="volunteer-active"
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
            disabled={
              saving ||
              !name.trim() ||
              !nationalRegisterNumber.trim() ||
              !eidDocumentNumber.trim() ||
              !firstHelpDay ||
              !lastHelpDay
            }
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

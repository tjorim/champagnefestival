import React, { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import type { Person, VolunteerHelpPeriod } from "@/types/person";

interface VolunteerFormModalProps {
  show: boolean;
  volunteer: Person | null;
  onSave: (data: VolunteerFormData) => Promise<void>;
  onHide: () => void;
}

export interface VolunteerHelpPeriodFormData {
  firstHelpDay: string;
  lastHelpDay: string | null;
}

export interface VolunteerFormData {
  name: string;
  address: string;
  nationalRegisterNumber: string;
  eidDocumentNumber: string;
  active: boolean;
  helpPeriods: VolunteerHelpPeriodFormData[];
}

function emptyPeriod(): VolunteerHelpPeriodFormData {
  return { firstHelpDay: "", lastHelpDay: null };
}

function mapPeriod(period: VolunteerHelpPeriod): VolunteerHelpPeriodFormData {
  return {
    firstHelpDay: period.firstHelpDay,
    lastHelpDay: period.lastHelpDay,
  };
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
  const [helpPeriods, setHelpPeriods] = useState<VolunteerHelpPeriodFormData[]>([emptyPeriod()]);
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
      setHelpPeriods(
        volunteer.helpPeriods.length > 0 ? volunteer.helpPeriods.map(mapPeriod) : [emptyPeriod()],
      );
      setActive(volunteer.active);
    } else {
      setName("");
      setAddress("");
      setNationalRegisterNumber("");
      setEidDocumentNumber("");
      setHelpPeriods([emptyPeriod()]);
      setActive(true);
    }
    setError(null);
    setSaving(false);
  }, [show, volunteer]);

  useEffect(() => {
    setError(null);
  }, [name, address, nationalRegisterNumber, eidDocumentNumber, active, helpPeriods]);

  function updateHelpPeriod(index: number, next: VolunteerHelpPeriodFormData) {
    setHelpPeriods((prev) => prev.map((period, i) => (i === index ? next : period)));
  }

  function removeHelpPeriod(index: number) {
    setHelpPeriods((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function normalizeHelpPeriods(): VolunteerHelpPeriodFormData[] | null {
    const normalized = helpPeriods.map((period) => ({
      firstHelpDay: period.firstHelpDay,
      lastHelpDay: period.lastHelpDay?.trim() ? period.lastHelpDay : null,
    }));

    if (normalized.length === 0 || normalized.some((period) => !period.firstHelpDay)) {
      setError(m.admin_volunteers_validation_help_period_required());
      return null;
    }

    if (
      normalized.some(
        (period) => period.lastHelpDay != null && period.firstHelpDay > period.lastHelpDay,
      )
    ) {
      setError(m.admin_volunteers_validation_help_period_range());
      return null;
    }

    return normalized;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !nationalRegisterNumber.trim() || !eidDocumentNumber.trim()) {
      return;
    }

    const normalizedHelpPeriods = normalizeHelpPeriods();
    if (!normalizedHelpPeriods) return;

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        address: address.trim(),
        nationalRegisterNumber: nationalRegisterNumber.trim(),
        eidDocumentNumber: eidDocumentNumber.trim(),
        active,
        helpPeriods: normalizedHelpPeriods,
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
    <Modal show={show} onHide={onHide} centered size="lg" data-bs-theme="dark">
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
                  onChange={(e) => setNationalRegisterNumber(e.target.value.slice(0, 20))}
                  className="bg-dark text-light border-secondary"
                  required
                  maxLength={20}
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

          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <Form.Label className="text-secondary small mb-0">
                {m.admin_volunteers_help_periods_label()} *
              </Form.Label>
              <Button
                type="button"
                variant="outline-warning"
                size="sm"
                onClick={() => setHelpPeriods((prev) => [...prev, emptyPeriod()])}
              >
                <i className="bi bi-plus-circle me-1" aria-hidden="true" />
                {m.admin_volunteers_add_help_period()}
              </Button>
            </div>

            {helpPeriods.length === 0 ? (
              <div className="text-secondary small">{m.admin_volunteers_no_help_periods()}</div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {helpPeriods.map((period, index) => (
                  <div
                    key={index}
                    className="border border-secondary rounded p-3"
                  >
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="text-secondary small">#{index + 1}</span>
                      <Button
                        type="button"
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeHelpPeriod(index)}
                        disabled={helpPeriods.length === 1}
                      >
                        <i className="bi bi-trash me-1" aria-hidden="true" />
                        {m.admin_volunteers_remove_help_period()}
                      </Button>
                    </div>
                    <Row>
                      <Col xs={12} md={6}>
                        <Form.Group controlId={`volunteer-period-start-${index}`}>
                          <Form.Label className="text-secondary small">
                            {m.admin_volunteers_period_start_label()} *
                          </Form.Label>
                          <Form.Control
                            type="date"
                            value={period.firstHelpDay}
                            onChange={(e) =>
                              updateHelpPeriod(index, {
                                ...period,
                                firstHelpDay: e.target.value,
                              })
                            }
                            className="bg-dark text-light border-secondary"
                            required
                          />
                        </Form.Group>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Group controlId={`volunteer-period-end-${index}`}>
                          <Form.Label className="text-secondary small">
                            {m.admin_volunteers_period_end_label()}
                          </Form.Label>
                          <Form.Control
                            type="date"
                            value={period.lastHelpDay ?? ""}
                            onChange={(e) =>
                              updateHelpPeriod(index, {
                                ...period,
                                lastHelpDay: e.target.value || null,
                              })
                            }
                            min={period.firstHelpDay || undefined}
                            className="bg-dark text-light border-secondary"
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </div>
                ))}
              </div>
            )}
          </div>

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
              saving || !name.trim() || !nationalRegisterNumber.trim() || !eidDocumentNumber.trim()
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

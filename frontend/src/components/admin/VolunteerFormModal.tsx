import { useEffect, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
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
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
      address: "",
      nationalRegisterNumber: "",
      eidDocumentNumber: "",
      active: true,
      helpPeriods: [emptyPeriod()],
    } as VolunteerFormData,
    onSubmit: async ({ value }) => {
      const normalized = value.helpPeriods.map((period) => ({
        firstHelpDay: period.firstHelpDay,
        lastHelpDay: period.lastHelpDay?.trim() ? period.lastHelpDay : null,
      }));

      if (normalized.length === 0 || normalized.some((period) => !period.firstHelpDay)) {
        setError(m.admin_volunteers_validation_help_period_required());
        return;
      }

      if (
        normalized.some(
          (period) => period.lastHelpDay != null && period.firstHelpDay > period.lastHelpDay,
        )
      ) {
        setError(m.admin_volunteers_validation_help_period_range());
        return;
      }

      setError(null);
      try {
        await onSave({
          name: value.name.trim(),
          address: value.address.trim(),
          nationalRegisterNumber: value.nationalRegisterNumber.trim(),
          eidDocumentNumber: value.eidDocumentNumber.trim(),
          active: value.active,
          helpPeriods: normalized,
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
      }
    },
  });

  useEffect(() => {
    if (!show) return;
    form.reset(
      volunteer
        ? {
            name: volunteer.name,
            address: volunteer.address ?? "",
            nationalRegisterNumber: volunteer.nationalRegisterNumber ?? "",
            eidDocumentNumber: volunteer.eidDocumentNumber ?? "",
            active: volunteer.active,
            helpPeriods:
              volunteer.helpPeriods.length > 0
                ? volunteer.helpPeriods.map(mapPeriod)
                : [emptyPeriod()],
          }
        : {
            name: "",
            address: "",
            nationalRegisterNumber: "",
            eidDocumentNumber: "",
            active: true,
            helpPeriods: [emptyPeriod()],
          },
    );
    setError(null);
  }, [show, volunteer, form]);

  const nameValue = useStore(form.store, (s) => s.values.name);
  const nationalRegisterNumberValue = useStore(form.store, (s) => s.values.nationalRegisterNumber);
  const eidDocumentNumberValue = useStore(form.store, (s) => s.values.eidDocumentNumber);
  const helpPeriods = useStore(form.store, (s) => s.values.helpPeriods);
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  return (
    <Modal show={show} onHide={onHide} centered size="lg" data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          <i className="bi bi-hand-thumbs-up me-2" aria-hidden="true" />
          {isEdit ? m.admin_volunteers_edit_title() : m.admin_volunteers_create_title()}
        </Modal.Title>
      </Modal.Header>

      <Form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
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

          <form.Field name="name">
            {(field) => (
              <Form.Group className="mb-3" controlId="volunteer-name">
                <Form.Label className="text-secondary small">{m.registration_name()} *</Form.Label>
                <Form.Control
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="bg-dark text-light border-secondary"
                  required
                  maxLength={200}
                />
              </Form.Group>
            )}
          </form.Field>

          <form.Field name="address">
            {(field) => (
              <Form.Group className="mb-3" controlId="volunteer-address">
                <Form.Label className="text-secondary small">
                  {m.admin_people_address_label()}
                </Form.Label>
                <Form.Control
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="bg-dark text-light border-secondary"
                  maxLength={300}
                />
              </Form.Group>
            )}
          </form.Field>

          <Row className="mb-3">
            <Col xs={12} md={6}>
              <form.Field name="nationalRegisterNumber">
                {(field) => (
                  <Form.Group controlId="volunteer-national-register-number">
                    <Form.Label className="text-secondary small">
                      {m.admin_people_national_register_number_label()} *
                    </Form.Label>
                    <Form.Control
                      type="text"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value.slice(0, 20))}
                      onBlur={field.handleBlur}
                      className="bg-dark text-light border-secondary"
                      required
                      maxLength={20}
                    />
                  </Form.Group>
                )}
              </form.Field>
            </Col>
            <Col xs={12} md={6}>
              <form.Field name="eidDocumentNumber">
                {(field) => (
                  <Form.Group controlId="volunteer-eid-document-number">
                    <Form.Label className="text-secondary small">
                      {m.admin_people_eid_document_number_label()} *
                    </Form.Label>
                    <Form.Control
                      type="text"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className="bg-dark text-light border-secondary"
                      required
                      maxLength={50}
                    />
                  </Form.Group>
                )}
              </form.Field>
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
                onClick={() => form.pushFieldValue("helpPeriods", emptyPeriod())}
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
                  <div key={index} className="border border-secondary rounded p-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="text-secondary small">#{index + 1}</span>
                      <Button
                        type="button"
                        variant="outline-danger"
                        size="sm"
                        onClick={() => void form.removeFieldValue("helpPeriods", index)}
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
                              void form.replaceFieldValue("helpPeriods", index, {
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
                              void form.replaceFieldValue("helpPeriods", index, {
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

          <form.Field name="active">
            {(field) => (
              <Form.Check
                id="volunteer-active"
                type="switch"
                label={m.admin_people_active_label()}
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
                className="text-secondary small"
              />
            )}
          </form.Field>
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
              isSubmitting ||
              !nameValue.trim() ||
              !nationalRegisterNumberValue.trim() ||
              !eidDocumentNumberValue.trim()
            }
          >
            {isSubmitting ? (
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

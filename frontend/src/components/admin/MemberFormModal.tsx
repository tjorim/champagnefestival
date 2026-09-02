import { useEffect, useMemo, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { devError } from "@/utils/devLog";
import { EMAIL_REGEX } from "@/config/constants";
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
  preferredLanguage?: "nl" | "fr" | "en" | null;
  address: string;
  clubName: string;
  notes: string;
  active: boolean;
}

export default function MemberFormModal({ show, member, onSave, onHide }: MemberFormModalProps) {
  const isEdit = member != null;
  const [error, setError] = useState<string | null>(null);

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  const defaultValues = useMemo(
    (): MemberFormData =>
      member
        ? {
            name: member.name,
            email: member.email ?? "",
            phone: member.phone ?? "",
            preferredLanguage: member.preferredLanguage ?? null,
            address: member.address ?? "",
            clubName: member.clubName ?? "",
            notes: member.notes ?? "",
            active: member.active,
          }
        : {
            name: "",
            email: "",
            phone: "",
            preferredLanguage: null,
            address: "",
            clubName: "",
            notes: "",
            active: true,
          },
    [member],
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await onSave({
          name: value.name.trim(),
          email: value.email.trim(),
          phone: value.phone.trim(),
          preferredLanguage: value.preferredLanguage,
          address: value.address.trim(),
          clubName: value.clubName.trim(),
          notes: value.notes.trim(),
          active: value.active,
        });
        onHide();
      } catch (err) {
        devError("Member save error:", err);
        const backendMessage =
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message.trim()
            : "";
        setError(
          backendMessage ||
            (isEdit ? m.admin_members_error_update() : m.admin_members_error_create()),
        );
      }
    },
  });

  useEffect(() => {
    if (!show) return;
    form.reset(defaultValues);
    setError(null);
  }, [defaultValues, form, show]);

  const nameValue = useStore(form.store, (s) => s.values.name);
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      size="lg"
      data-bs-theme="dark"
      dialogClassName="admin-dialog"
    >
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          <i className="bi bi-person-badge me-2" aria-hidden="true" />
          {isEdit ? m.admin_members_edit_title() : m.admin_members_create_title()}
        </Modal.Title>
      </Modal.Header>

      <Form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        noValidate
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

          <Form.Group className="mb-3" controlId="member-name">
            <Form.Label className="text-secondary small">{m.registration_name()} *</Form.Label>
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) =>
                  !value?.trim() ? m.registration_errors_name_required() : undefined,
              }}
            >
              {(field) => {
                const showErr = field.state.meta.isTouched && field.state.meta.errors.length > 0;
                return (
                  <>
                    <Form.Control
                      type="text"
                      className="bg-dark text-light border-secondary"
                      maxLength={200}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      isInvalid={showErr}
                    />
                    {showErr && (
                      <Form.Control.Feedback type="invalid">
                        {field.state.meta.errors[0]}
                      </Form.Control.Feedback>
                    )}
                  </>
                );
              }}
            </form.Field>
          </Form.Group>

          <Row className="mb-3">
            <Col xs={12} md={6}>
              <Form.Group controlId="member-email">
                <Form.Label className="text-secondary small">{m.registration_email()}</Form.Label>
                <form.Field
                  name="email"
                  validators={{
                    onChange: ({ value }) =>
                      value && !EMAIL_REGEX.test(value)
                        ? m.registration_errors_email_invalid()
                        : undefined,
                  }}
                >
                  {(field) => {
                    const showErr =
                      field.state.meta.isTouched && field.state.meta.errors.length > 0;
                    return (
                      <>
                        <Form.Control
                          type="email"
                          className="bg-dark text-light border-secondary"
                          maxLength={200}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          isInvalid={showErr}
                        />
                        {showErr && (
                          <Form.Control.Feedback type="invalid">
                            {field.state.meta.errors[0]}
                          </Form.Control.Feedback>
                        )}
                      </>
                    );
                  }}
                </form.Field>
              </Form.Group>
            </Col>
            <Col xs={12} md={6}>
              <Form.Group controlId="member-phone">
                <Form.Label className="text-secondary small">{m.registration_phone()}</Form.Label>
                <form.Field name="phone">
                  {(field) => (
                    <Form.Control
                      type="tel"
                      className="bg-dark text-light border-secondary"
                      maxLength={50}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </Form.Group>
            </Col>
          </Row>

          <form.Field name="preferredLanguage">
            {(field) => (
              <Form.Group className="mb-3" controlId="member-preferred-language">
                <Form.Label>{m.registration_preferred_language()}</Form.Label>
                <Form.Select
                  value={field.state.value ?? ""}
                  onChange={(event) =>
                    field.handleChange((event.target.value || null) as "nl" | "fr" | "en" | null)
                  }
                >
                  <option value="">{m.admin_email_language_unknown()}</option>
                  <option value="nl">Nederlands</option>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </Form.Select>
              </Form.Group>
            )}
          </form.Field>
          <Form.Group className="mb-3" controlId="member-club">
            <Form.Label className="text-secondary small fw-semibold text-warning-emphasis">
              {m.admin_people_club_name_label()}
            </Form.Label>
            <form.Field name="clubName">
              {(field) => (
                <Form.Control
                  type="text"
                  className="bg-dark text-light border-secondary border-warning"
                  maxLength={200}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>

          <Form.Group className="mb-3" controlId="member-address">
            <Form.Label className="text-secondary small">
              {m.admin_people_address_label()}
            </Form.Label>
            <form.Field name="address">
              {(field) => (
                <Form.Control
                  type="text"
                  className="bg-dark text-light border-secondary"
                  maxLength={300}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>

          <Form.Group className="mb-3" controlId="member-notes">
            <Form.Label className="text-secondary small">{m.registration_notes()}</Form.Label>
            <form.Field name="notes">
              {(field) => (
                <Form.Control
                  as="textarea"
                  rows={4}
                  className="bg-dark text-light border-secondary"
                  maxLength={2000}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>

          <form.Field name="active">
            {(field) => (
              <Form.Check
                type="switch"
                id="member-active"
                className="text-secondary"
                label={m.admin_people_active_label()}
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />
            )}
          </form.Field>
        </Modal.Body>

        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" onClick={onHide} disabled={isSubmitting}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="warning" type="submit" disabled={isSubmitting || !nameValue?.trim()}>
            {isSubmitting ? (
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

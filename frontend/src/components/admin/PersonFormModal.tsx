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
import type { Person } from "@/types/person";
import { EMAIL_REGEX } from "@/config/constants";

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

const KNOWN_ROLES = ["member", "volunteer", "visitor", "admin"] as const;
type KnownRole = (typeof KNOWN_ROLES)[number];

/** Maps localized or variant spellings to canonical role keys */
const ROLE_ALIASES: Record<string, KnownRole> = {
  // member
  member: "member",
  lid: "member",
  membre: "member",
  // volunteer
  volunteer: "volunteer",
  vrijwilliger: "volunteer",
  benevole: "volunteer",
  bénévole: "volunteer",
  // visitor
  visitor: "visitor",
  bezoeker: "visitor",
  visiteur: "visitor",
  // admin
  admin: "admin",
  beheerder: "admin",
  administrateur: "admin",
};

function canonicalizeRole(raw: string): string {
  const key = raw.trim().toLowerCase();
  return ROLE_ALIASES[key] ?? key;
}

function roleLabel(role: string): string {
  switch (role) {
    case "member":
      return m.admin_role_member();
    case "volunteer":
      return m.admin_role_volunteer();
    case "visitor":
      return m.admin_role_visitor();
    case "admin":
      return m.admin_role_admin();
    default:
      return role;
  }
}

function parseRoles(raw: string): string[] {
  return raw
    .split(",")
    .map((r) => canonicalizeRole(r))
    .filter(Boolean);
}

export default function PersonFormModal({ show, person, onSave, onHide }: PersonFormModalProps) {
  const isEdit = person != null;
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      rolesInput: "",
      notes: "",
      clubName: "",
      active: true,
    },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await onSave({
          name: value.name.trim(),
          email: value.email.trim(),
          phone: value.phone.trim(),
          address: value.address.trim(),
          roles: parseRoles(value.rolesInput),
          notes: value.notes.trim(),
          clubName: value.clubName.trim(),
          active: value.active,
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
      }
    },
  });

  useEffect(() => {
    if (!show) return;
    form.reset(
      person
        ? {
            name: person.name,
            email: person.email ?? "",
            phone: person.phone ?? "",
            address: person.address ?? "",
            rolesInput: person.roles.join(", "),
            notes: person.notes ?? "",
            clubName: person.clubName ?? "",
            active: person.active,
          }
        : {
            name: "",
            email: "",
            phone: "",
            address: "",
            rolesInput: "",
            notes: "",
            clubName: "",
            active: true,
          },
    );
    setError(null);
  }, [show, person, form]);

  const nameValue = useStore(form.store, (s) => s.values.name);
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
  const rolesInput = useStore(form.store, (s) => s.values.rolesInput) ?? "";
  const currentRoles = parseRoles(rolesInput);

  function toggleRole(role: string) {
    const next = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    form.setFieldValue("rolesInput", next.join(", "));
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark" dialogClassName="admin-dialog">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          <i className="bi bi-person-plus me-2" aria-hidden="true" />
          {isEdit ? m.admin_people_edit_title() : m.admin_people_create_title()}
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

          <Form.Group className="mb-3" controlId="person-name">
            <Form.Label className="text-secondary small">{m.registration_name()} *</Form.Label>
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) =>
                  !value?.trim() ? m.registration_errors_name_required() : undefined,
              }}
            >
              {(field) => {
                const showErr = !!field.state.meta.errors.length && field.state.meta.isTouched;
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
              <Form.Group controlId="person-email">
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
              <Form.Group controlId="person-phone">
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

          <Form.Group className="mb-3" controlId="person-address">
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

          <Form.Group className="mb-3" controlId="person-club">
            <Form.Label className="text-secondary small">
              {m.admin_people_club_name_label()}
            </Form.Label>
            <form.Field name="clubName">
              {(field) => (
                <Form.Control
                  type="text"
                  className="bg-dark text-light border-secondary"
                  maxLength={200}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_people_roles_label()}</Form.Label>
            <div className="d-flex flex-wrap gap-2 mb-2">
              {KNOWN_ROLES.map((role) => (
                <Button
                  key={role}
                  size="sm"
                  variant={currentRoles.includes(role) ? "warning" : "outline-secondary"}
                  onClick={() => toggleRole(role)}
                  type="button"
                >
                  {roleLabel(role)}
                </Button>
              ))}
            </div>
            <form.Field name="rolesInput">
              {(field) => (
                <Form.Control
                  type="text"
                  className="bg-dark text-light border-secondary"
                  placeholder={m.admin_people_roles_placeholder()}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>

          <Form.Group className="mb-3" controlId="person-notes">
            <Form.Label className="text-secondary small">{m.admin_notes()}</Form.Label>
            <form.Field name="notes">
              {(field) => (
                <Form.Control
                  as="textarea"
                  rows={2}
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
                id="person-active"
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
            disabled={isSubmitting || !nameValue?.trim()}
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

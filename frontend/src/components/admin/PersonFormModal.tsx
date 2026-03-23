import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
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

interface PersonFormFields {
  name: string;
  email: string;
  phone: string;
  address: string;
  rolesInput: string;
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

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { isSubmitting, errors },
  } = useForm<PersonFormFields>({
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
  });

  useEffect(() => {
    if (!show) return;
    reset(
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
  }, [show, person, reset]);

  const nameValue = watch("name");
  const rolesInput = watch("rolesInput") ?? "";
  const currentRoles = parseRoles(rolesInput);

  function toggleRole(role: string) {
    const next = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    setValue("rolesInput", next.join(", "));
  }

  async function onSubmit(data: PersonFormFields) {
    setError(null);
    try {
      await onSave({
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        address: data.address.trim(),
        roles: parseRoles(data.rolesInput),
        notes: data.notes.trim(),
        clubName: data.clubName.trim(),
        active: data.active,
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
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          <i className="bi bi-person-plus me-2" aria-hidden="true" />
          {isEdit ? m.admin_people_edit_title() : m.admin_people_create_title()}
        </Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit(onSubmit)} noValidate>
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
            <Form.Control
              type="text"
              className="bg-dark text-light border-secondary"
              required
              maxLength={200}
              {...register("name", { required: true })}
            />
          </Form.Group>

          <Row className="mb-3">
            <Col xs={12} md={6}>
              <Form.Group controlId="person-email">
                <Form.Label className="text-secondary small">{m.registration_email()}</Form.Label>
                <Form.Control
                  type="email"
                  className="bg-dark text-light border-secondary"
                  maxLength={200}
                  isInvalid={!!errors.email}
                  {...register("email", {
                    pattern: {
                      value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
                      message: "Invalid email address",
                    },
                  })}
                />
                {errors.email && (
                  <Form.Control.Feedback type="invalid">
                    {errors.email.message}
                  </Form.Control.Feedback>
                )}
              </Form.Group>
            </Col>
            <Col xs={12} md={6}>
              <Form.Group controlId="person-phone">
                <Form.Label className="text-secondary small">{m.registration_phone()}</Form.Label>
                <Form.Control
                  type="tel"
                  className="bg-dark text-light border-secondary"
                  maxLength={50}
                  {...register("phone")}
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
              className="bg-dark text-light border-secondary"
              maxLength={300}
              {...register("address")}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="person-club">
            <Form.Label className="text-secondary small">
              {m.admin_people_club_name_label()}
            </Form.Label>
            <Form.Control
              type="text"
              className="bg-dark text-light border-secondary"
              maxLength={200}
              {...register("clubName")}
            />
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
            <Form.Control
              type="text"
              className="bg-dark text-light border-secondary"
              placeholder={m.admin_people_roles_placeholder()}
              {...register("rolesInput")}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="person-notes">
            <Form.Label className="text-secondary small">{m.admin_notes()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              className="bg-dark text-light border-secondary"
              maxLength={2000}
              {...register("notes")}
            />
          </Form.Group>

          <Controller
            name="active"
            control={control}
            render={({ field: { value, onChange, ref } }) => (
              <Form.Check
                id="person-active"
                type="switch"
                label={m.admin_people_active_label()}
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
                ref={ref}
                className="text-secondary small"
              />
            )}
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

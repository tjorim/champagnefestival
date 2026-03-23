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

export default function MemberFormModal({ show, member, onSave, onHide }: MemberFormModalProps) {
  const isEdit = member != null;
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { isSubmitting },
  } = useForm<MemberFormData>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      clubName: "",
      notes: "",
      active: true,
    },
  });

  useEffect(() => {
    if (!show) return;
    reset(
      member
        ? {
            name: member.name,
            email: member.email ?? "",
            phone: member.phone ?? "",
            address: member.address ?? "",
            clubName: member.clubName ?? "",
            notes: member.notes ?? "",
            active: member.active,
          }
        : {
            name: "",
            email: "",
            phone: "",
            address: "",
            clubName: "",
            notes: "",
            active: true,
          },
    );
    setError(null);
  }, [show, member, reset]);

  const nameValue = watch("name");

  async function onSubmit(data: MemberFormData) {
    setError(null);
    try {
      await onSave({
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        address: data.address.trim(),
        clubName: data.clubName.trim(),
        notes: data.notes.trim(),
        active: data.active,
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

          <Form.Group className="mb-3" controlId="member-name">
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
              <Form.Group controlId="member-email">
                <Form.Label className="text-secondary small">{m.registration_email()}</Form.Label>
                <Form.Control
                  type="email"
                  className="bg-dark text-light border-secondary"
                  maxLength={200}
                  {...register("email")}
                />
              </Form.Group>
            </Col>
            <Col xs={12} md={6}>
              <Form.Group controlId="member-phone">
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

          <Form.Group className="mb-3" controlId="member-club">
            <Form.Label className="text-secondary small fw-semibold text-warning-emphasis">
              {m.admin_people_club_name_label()}
            </Form.Label>
            <Form.Control
              type="text"
              className="bg-dark text-light border-secondary border-warning"
              maxLength={200}
              {...register("clubName")}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="member-address">
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

          <Form.Group className="mb-3" controlId="member-notes">
            <Form.Label className="text-secondary small">{m.registration_notes()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
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
                type="switch"
                id="member-active"
                className="text-secondary"
                label={m.admin_people_active_label()}
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
                ref={ref}
              />
            )}
          />
        </Modal.Body>

        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" onClick={onHide} disabled={isSubmitting}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="warning"
            type="submit"
            disabled={isSubmitting || !nameValue?.trim()}
          >
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

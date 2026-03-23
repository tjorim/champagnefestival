import { useMutation } from "@tanstack/react-query";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { ALL_PRODUCTS, MAX_GUESTS, MIN_GUESTS, MIN_FORM_SECONDS } from "@/config/registration";
import type { RegistrationFormData, OrderItem } from "@/types/registration";
import { RegistrationSubmitError, submitRegistration } from "@/utils/publicRegistrationApi";

interface RegistrationModalProps {
  show: boolean;
  onHide: () => void;
  /** Pre-selected event id, if triggered from the schedule */
  defaultEventId?: string;
  /** Available events that require registration */
  registrableEvents: { id: string; title: string }[];
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function getProductName(nameKey: string): string {
  switch (nameKey) {
    case "champagne_standard":
      return m.registration_product_champagne_standard();
    case "champagne_prestige":
      return m.registration_product_champagne_prestige();
    case "champagne_glass":
      return m.registration_product_champagne_glass();
    case "food_cheese":
      return m.registration_product_food_cheese();
    case "food_charcuterie":
      return m.registration_product_food_charcuterie();
    default:
      return nameKey;
  }
}

export default function RegistrationModal({
  show,
  onHide,
  defaultEventId = "",
  registrableEvents,
}: RegistrationModalProps) {
  const [preOrders, setPreOrders] = useState<OrderItem[]>([]);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      eventId: defaultEventId,
      guestCount: 1,
      notes: "",
      honeypot: "",
      formStartTime: new Date().toISOString(),
    },
  });

  const submitRegistrationMutation = useMutation({
    mutationFn: (payload: RegistrationFormData) => submitRegistration(payload),
    retry: false,
  });

  const isSubmitting = submitRegistrationMutation.isPending;

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setValue("eventId", defaultEventId);
  }, [defaultEventId, setValue]);

  const handleQuantityChange = useCallback((productId: string, quantity: number) => {
    setPreOrders((prev) => {
      const existing = prev.find((o) => o.productId === productId);
      if (quantity <= 0) {
        return prev.filter((o) => o.productId !== productId);
      }
      const product = ALL_PRODUCTS.find((p) => p.id === productId);
      if (!product) return prev;

      const item: OrderItem = {
        productId,
        name: getProductName(product.nameKey),
        quantity,
        price: product.price,
        category: product.category,
        delivered: false,
      };

      if (existing) {
        return prev.map((o) => (o.productId === productId ? item : o));
      }
      return [...prev, item];
    });
  }, []);

  const onSubmit = useCallback(
    async (data: RegistrationFormData) => {
      setSubmitError("");
      try {
        await submitRegistrationMutation.mutateAsync({ ...data, preOrders });
        setSubmitSuccess(true);
      } catch (error) {
        setSubmitError(
          error instanceof RegistrationSubmitError ? error.message : m.registration_network_error(),
        );
      }
    },
    [preOrders, submitRegistrationMutation],
  );

  const handleClose = useCallback(() => {
    reset({
      name: "",
      email: "",
      phone: "",
      eventId: defaultEventId,
      guestCount: 1,
      notes: "",
      honeypot: "",
      formStartTime: new Date().toISOString(),
    });
    setPreOrders([]);
    setSubmitSuccess(false);
    setSubmitError("");
    onHide();
  }, [defaultEventId, reset, onHide]);

  return (
    <Modal
      show={show}
      onHide={handleClose}
      size="lg"
      centered
      aria-labelledby="registration-modal-title"
    >
      <Modal.Header closeButton className="bg-dark text-light border-secondary">
        <Modal.Title id="registration-modal-title">
          <i className="bi bi-star-fill text-warning me-2" aria-hidden="true" />
          {m.registration_modal_title()}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="bg-dark text-light">
        {submitSuccess ? (
          <Alert variant="success" className="mb-0">
            <i className="bi bi-check-circle-fill me-2" aria-hidden="true" />
            {m.registration_success()}
          </Alert>
        ) : (
          <Form
            onSubmit={handleSubmit(onSubmit)}
            onChange={(e: React.ChangeEvent<HTMLFormElement>) => {
              const name = (e.target as Element).getAttribute("name") as keyof RegistrationFormData | null;
              if (name) clearErrors(name);
            }}
            noValidate
          >
            {/* Honeypot – hidden from users, must stay empty */}
            <Form.Control
              type="text"
              aria-hidden="true"
              tabIndex={-1}
              autoComplete="off"
              className="d-none"
              {...register("honeypot", { validate: (v) => !v })}
            />

            {/* Personal details */}
            <Form.Group className="mb-3" controlId="res-name">
              <Form.Label>{m.registration_name()} *</Form.Label>
              <Form.Control
                type="text"
                isInvalid={!!errors.name}
                className="bg-dark text-light border-secondary"
                autoComplete="name"
                {...register("name", { required: m.registration_errors_name_required() })}
              />
              <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="res-email">
              <Form.Label>{m.registration_email()} *</Form.Label>
              <Form.Control
                type="email"
                isInvalid={!!errors.email}
                className="bg-dark text-light border-secondary"
                autoComplete="email"
                {...register("email", {
                  required: m.registration_errors_email_required(),
                  pattern: {
                    value: EMAIL_REGEX,
                    message: m.registration_errors_email_invalid(),
                  },
                })}
              />
              <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="res-phone">
              <Form.Label>{m.registration_phone()} *</Form.Label>
              <Form.Control
                type="tel"
                isInvalid={!!errors.phone}
                className="bg-dark text-light border-secondary"
                autoComplete="tel"
                {...register("phone", { required: m.registration_errors_phone_required() })}
              />
              <Form.Control.Feedback type="invalid">{errors.phone?.message}</Form.Control.Feedback>
            </Form.Group>

            {/* Event selection */}
            <Form.Group className="mb-3" controlId="res-event">
              <Form.Label>{m.registration_event()} *</Form.Label>
              <Form.Select
                isInvalid={!!errors.eventId}
                className="bg-dark text-light border-secondary"
                {...register("eventId", { required: m.registration_errors_event_required() })}
              >
                <option value="">{m.registration_select_event()}</option>
                {registrableEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </Form.Select>
              <Form.Control.Feedback type="invalid">{errors.eventId?.message}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="res-guests">
              <Form.Label>{m.registration_guests()} *</Form.Label>
              <Form.Control
                type="number"
                isInvalid={!!errors.guestCount}
                min={MIN_GUESTS}
                max={MAX_GUESTS}
                className="bg-dark text-light border-secondary"
                {...register("guestCount", {
                  required: m.registration_errors_guests_required(),
                  valueAsNumber: true,
                  min: { value: MIN_GUESTS, message: m.registration_errors_guests_min() },
                  max: { value: MAX_GUESTS, message: m.registration_errors_guests_max() },
                })}
              />
              <Form.Control.Feedback type="invalid">
                {errors.guestCount?.message}
              </Form.Control.Feedback>
            </Form.Group>

            {/* Pre-order */}
            <fieldset className="mb-3">
              <legend className="fs-6 fw-semibold mb-1">{m.registration_preorder_title()}</legend>
              <p className="text-secondary small mb-2">{m.registration_preorder_description()}</p>

              {ALL_PRODUCTS.filter((p) => p.available).map((product) => {
                const currentItem = preOrders.find((o) => o.productId === product.id);
                const qty = currentItem?.quantity ?? 0;
                return (
                  <div
                    key={product.id}
                    className="d-flex align-items-center justify-content-between mb-2"
                  >
                    <span className="text-light small">{getProductName(product.nameKey)}</span>
                    <div className="d-flex align-items-center gap-2">
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => handleQuantityChange(product.id, qty - 1)}
                        disabled={qty === 0}
                        aria-label={`Decrease quantity of ${getProductName(product.nameKey)}`}
                      >
                        <i className="bi bi-dash" aria-hidden="true" />
                      </Button>
                      <span
                        className="text-light"
                        style={{ minWidth: "1.5rem", textAlign: "center" }}
                      >
                        {qty}
                      </span>
                      <Button
                        variant="outline-warning"
                        size="sm"
                        onClick={() => handleQuantityChange(product.id, qty + 1)}
                        aria-label={`Increase quantity of ${getProductName(product.nameKey)}`}
                      >
                        <i className="bi bi-plus" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </fieldset>

            {/* Notes */}
            <Form.Group className="mb-3" controlId="res-notes">
              <Form.Label>{m.registration_notes()}</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder={m.registration_notes_placeholder()}
                className="bg-dark text-light border-secondary"
                {...register("notes")}
              />
            </Form.Group>

            {submitError && (
              <Alert variant="danger" className="mb-3">
                <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                {submitError}
              </Alert>
            )}

            <Button
              type="submit"
              variant="warning"
              className="w-100"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                    className="me-2"
                  />
                  {m.registration_submitting()}
                </>
              ) : (
                <>
                  <i className="bi bi-calendar-check me-2" aria-hidden="true" />
                  {m.registration_submit()}
                </>
              )}
            </Button>
          </Form>
        )}
      </Modal.Body>

      {submitSuccess && (
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-light" onClick={handleClose}>
            {m.close()}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

/** Minimum time check export for testing */
export { MIN_FORM_SECONDS };

import React, { useState, useCallback } from "react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { m } from "../paraglide/messages";
import { ALL_PRODUCTS, MAX_GUESTS, MIN_GUESTS, MIN_FORM_SECONDS } from "../config/reservation";
import type { ReservationFormData, ReservationFormErrors, OrderItem } from "../types/reservation";

interface ReservationModalProps {
  show: boolean;
  onHide: () => void;
  /** Pre-selected event id, if triggered from the schedule */
  defaultEventId?: string;
  /** Available events that require reservation */
  reservableEvents: { id: string; title: string }[];
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function getProductName(nameKey: string): string {
  switch (nameKey) {
    case "champagne_standard":
      return m.reservation_product_champagne_standard();
    case "champagne_prestige":
      return m.reservation_product_champagne_prestige();
    case "champagne_glass":
      return m.reservation_product_champagne_glass();
    case "food_cheese":
      return m.reservation_product_food_cheese();
    case "food_charcuterie":
      return m.reservation_product_food_charcuterie();
    default:
      return nameKey;
  }
}

export default function ReservationModal({
  show,
  onHide,
  defaultEventId = "",
  reservableEvents,
}: ReservationModalProps) {
  const [formData, setFormData] = useState<ReservationFormData>({
    name: "",
    email: "",
    phone: "",
    eventId: defaultEventId,
    guestCount: 1,
    preOrders: [],
    notes: "",
    honeypot: "",
    formStartTime: Date.now().toString(),
  });
  const [errors, setErrors] = useState<ReservationFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const validate = useCallback((): boolean => {
    const newErrors: ReservationFormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = m.reservation_errors_name_required();
    }
    if (!formData.email.trim()) {
      newErrors.email = m.reservation_errors_email_required();
    } else if (!EMAIL_REGEX.test(formData.email)) {
      newErrors.email = m.reservation_errors_email_invalid();
    }
    if (!formData.phone.trim()) {
      newErrors.phone = m.reservation_errors_phone_required();
    }
    if (!formData.eventId) {
      newErrors.eventId = m.reservation_errors_event_required();
    }
    if (!formData.guestCount) {
      newErrors.guestCount = m.reservation_errors_guests_required();
    } else if (formData.guestCount < MIN_GUESTS) {
      newErrors.guestCount = m.reservation_errors_guests_min();
    } else if (formData.guestCount > MAX_GUESTS) {
      newErrors.guestCount = m.reservation_errors_guests_max();
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({
        ...prev,
        [name]: name === "guestCount" ? Number(value) : value,
      }));
      // Clear the error for this field on change
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    },
    [],
  );

  const handleQuantityChange = useCallback((productId: string, quantity: number) => {
    setFormData((prev) => {
      const existing = prev.preOrders.find((o) => o.productId === productId);
      if (quantity <= 0) {
        return { ...prev, preOrders: prev.preOrders.filter((o) => o.productId !== productId) };
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
        return {
          ...prev,
          preOrders: prev.preOrders.map((o) => (o.productId === productId ? item : o)),
        };
      }
      return { ...prev, preOrders: [...prev.preOrders, item] };
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setIsSubmitting(true);
      setSubmitError("");

      const selectedEvent = reservableEvents.find((ev) => ev.id === formData.eventId);

      try {
        const response = await fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            eventTitle: selectedEvent?.title ?? "",
          }),
        });

        if (response.ok) {
          setSubmitSuccess(true);
        } else {
          const data = await response.json().catch(() => ({}));
          setSubmitError((data as { error?: string }).error ?? m.reservation_error());
        }
      } catch {
        setSubmitError(m.reservation_network_error());
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, validate, reservableEvents],
  );

  const handleClose = useCallback(() => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      eventId: defaultEventId,
      guestCount: 1,
      preOrders: [],
      notes: "",
      honeypot: "",
      formStartTime: Date.now().toString(),
    });
    setErrors({});
    setSubmitSuccess(false);
    setSubmitError("");
    onHide();
  }, [defaultEventId, onHide]);

  return (
    <Modal
      show={show}
      onHide={handleClose}
      size="lg"
      centered
      aria-labelledby="reservation-modal-title"
    >
      <Modal.Header closeButton className="bg-dark text-light border-secondary">
        <Modal.Title id="reservation-modal-title">
          <i className="bi bi-star-fill text-warning me-2" aria-hidden="true" />
          {m.reservation_modal_title()}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="bg-dark text-light">
        {submitSuccess ? (
          <Alert variant="success" className="mb-0">
            <i className="bi bi-check-circle-fill me-2" aria-hidden="true" />
            {m.reservation_success()}
          </Alert>
        ) : (
          <Form onSubmit={handleSubmit} noValidate>
            {/* Honeypot – hidden from users, must stay empty */}
            <Form.Control
              type="text"
              name="honeypot"
              value={formData.honeypot}
              onChange={handleChange}
              aria-hidden="true"
              tabIndex={-1}
              autoComplete="off"
              style={{ display: "none" }}
            />

            {/* Personal details */}
            <Form.Group className="mb-3" controlId="res-name">
              <Form.Label>{m.reservation_name()} *</Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                isInvalid={!!errors.name}
                className="bg-dark text-light border-secondary"
                autoComplete="name"
                required
              />
              <Form.Control.Feedback type="invalid">{errors.name}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="res-email">
              <Form.Label>{m.reservation_email()} *</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                isInvalid={!!errors.email}
                className="bg-dark text-light border-secondary"
                autoComplete="email"
                required
              />
              <Form.Control.Feedback type="invalid">{errors.email}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="res-phone">
              <Form.Label>{m.reservation_phone()} *</Form.Label>
              <Form.Control
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                isInvalid={!!errors.phone}
                className="bg-dark text-light border-secondary"
                autoComplete="tel"
                required
              />
              <Form.Control.Feedback type="invalid">{errors.phone}</Form.Control.Feedback>
            </Form.Group>

            {/* Event selection */}
            <Form.Group className="mb-3" controlId="res-event">
              <Form.Label>{m.reservation_event()} *</Form.Label>
              <Form.Select
                name="eventId"
                value={formData.eventId}
                onChange={handleChange}
                isInvalid={!!errors.eventId}
                className="bg-dark text-light border-secondary"
                required
              >
                <option value="">{m.reservation_select_event()}</option>
                {reservableEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </Form.Select>
              <Form.Control.Feedback type="invalid">{errors.eventId}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="res-guests">
              <Form.Label>{m.reservation_guests()} *</Form.Label>
              <Form.Control
                type="number"
                name="guestCount"
                value={formData.guestCount}
                onChange={handleChange}
                isInvalid={!!errors.guestCount}
                min={MIN_GUESTS}
                max={MAX_GUESTS}
                className="bg-dark text-light border-secondary"
                required
              />
              <Form.Control.Feedback type="invalid">{errors.guestCount}</Form.Control.Feedback>
            </Form.Group>

            {/* Pre-order */}
            <fieldset className="mb-3">
              <legend className="fs-6 fw-semibold mb-1">{m.reservation_preorder_title()}</legend>
              <p className="text-secondary small mb-2">{m.reservation_preorder_description()}</p>

              {ALL_PRODUCTS.filter((p) => p.available).map((product) => {
                const currentItem = formData.preOrders.find((o) => o.productId === product.id);
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
                      <span className="text-light" style={{ minWidth: "1.5rem", textAlign: "center" }}>
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
              <Form.Label>{m.reservation_notes()}</Form.Label>
              <Form.Control
                as="textarea"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                placeholder={m.reservation_notes_placeholder()}
                className="bg-dark text-light border-secondary"
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
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                  {m.reservation_submitting()}
                </>
              ) : (
                <>
                  <i className="bi bi-calendar-check me-2" aria-hidden="true" />
                  {m.reservation_submit()}
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

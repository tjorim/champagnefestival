import { useMutation } from "@tanstack/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useState, useCallback, useMemo } from "react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { MAX_GUESTS, MIN_GUESTS } from "@/config/registration";
import { EMAIL_REGEX } from "@/config/constants";
import type { RegistrationFormData, OrderItem } from "@/types/registration";
import type { Event } from "@/types/event";
import { RegistrationSubmitError, submitRegistration } from "@/utils/publicRegistrationApi";
import { useAuth } from "@/contexts/AuthContext";

interface RegistrationModalProps {
  show: boolean;
  onHide: () => void;
  event: Event | null;
}

interface RegistrationFields {
  name: string;
  email: string;
  phone: string;
  guestCount: number;
  notes: string;
  honeypot: string;
  formStartTime: string;
}

export default function RegistrationModal({ show, onHide, event }: RegistrationModalProps) {
  const auth = useAuth();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [registrationId, setRegistrationId] = useState("");
  const [submitError, setSubmitError] = useState("");

  const submitRegistrationMutation = useMutation({
    mutationFn: (payload: RegistrationFormData) =>
      submitRegistration(payload, auth.getAccessToken()),
    retry: false,
  });

  const isSubmitting = submitRegistrationMutation.isPending;
  const products = useMemo(() => event?.products ?? [], [event]);
  // Whether guests can order anything is answered by the event actually
  // having products, not by a separate flag — see Event.products.
  const showOrderItems = products.length > 0;

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      guestCount: 1,
      notes: "",
      honeypot: "",
      formStartTime: new Date().toISOString(),
    } as RegistrationFields,
    onSubmit: async ({ value }) => {
      setSubmitError("");
      if (!event?.id) {
        setSubmitError(m.registration_error());
        return;
      }

      try {
        const created = await submitRegistrationMutation.mutateAsync({
          ...value,
          eventId: event.id,
          orderItems: showOrderItems ? orderItems : [],
        });
        setRegistrationId(created.id);
        setSubmitSuccess(true);
      } catch (error) {
        setSubmitError(
          error instanceof RegistrationSubmitError ? error.message : m.registration_network_error(),
        );
      }
    },
  });

  const handleQuantityChange = useCallback(
    (productId: string, quantity: number) => {
      setOrderItems((prev) => {
        const existing = prev.find((o) => o.productId === productId);
        if (quantity <= 0) {
          return prev.filter((o) => o.productId !== productId);
        }
        const product = products.find((p) => p.id === productId);
        if (!product) return prev;

        const item: OrderItem = {
          productId,
          name: product.name,
          quantity,
          deliveredQuantity: 0,
          remainingQuantity: quantity,
          price: product.price,
          category: product.category,
          delivered: false,
          // The server computes and merges any bundle-included quantity on top
          // of this — the client only ever asks for what's explicitly chosen.
          includedQuantity: 0,
        };

        if (existing) {
          return prev.map((o) => (o.productId === productId ? item : o));
        }
        return [...prev, item];
      });
    },
    [products],
  );

  const guestCount = useStore(form.store, (s) => s.values.guestCount);

  const requiredProducts = useMemo(() => products.filter((p) => p.required), [products]);
  const hasRequiredSelected = useMemo(
    () => orderItems.some((o) => requiredProducts.some((rp) => rp.id === o.productId)),
    [orderItems, requiredProducts],
  );

  // product_id -> free quantity included by whichever bundling product is
  // currently selected, computed the same way the server will (see
  // _resolve_order_items): floor(guestCount / includedPerGuests).
  const includedQuantities = useMemo(() => {
    const included = new Map<string, { quantity: number; sourceName: string }>();
    for (const order of orderItems) {
      const source = products.find((p) => p.id === order.productId);
      if (!source?.includedProductId || !source.includedPerGuests) continue;
      const qty = Math.floor((guestCount || 0) / source.includedPerGuests);
      if (qty <= 0) continue;
      const existing = included.get(source.includedProductId);
      included.set(source.includedProductId, {
        quantity: (existing?.quantity ?? 0) + qty,
        sourceName: existing ? `${existing.sourceName}, ${source.name}` : source.name,
      });
    }
    return included;
  }, [guestCount, orderItems, products]);

  const handleClose = useCallback(() => {
    form.reset({
      name: "",
      email: "",
      phone: "",
      guestCount: 1,
      notes: "",
      honeypot: "",
      formStartTime: new Date().toISOString(),
    });
    setOrderItems([]);
    setSubmitSuccess(false);
    setRegistrationId("");
    setSubmitError("");
    onHide();
  }, [form, onHide]);

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
          <i className="bi bi-ticket-perforated-fill text-warning me-2" aria-hidden="true" />
          {event?.title ?? m.registration_modal_title()}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="bg-dark text-light">
        {!event ? (
          <Alert variant="danger" className="mb-0">
            <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
            {m.registration_error()}
          </Alert>
        ) : submitSuccess ? (
          <Alert variant="success" className="mb-0">
            <i className="bi bi-check-circle-fill me-2" aria-hidden="true" />
            {m.registration_success()}
            <div className="mt-2">{m.registration_reference({ reference: registrationId })}</div>
            <a href="/my-registrations" className="alert-link">
              {m.registration_view_my_registrations()}
            </a>
          </Alert>
        ) : (
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
            noValidate
          >
            <form.Field name="honeypot">
              {(field) => (
                <Form.Control
                  type="text"
                  aria-hidden="true"
                  tabIndex={-1}
                  autoComplete="off"
                  className="d-none"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>

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
                  <Form.Group className="mb-3" controlId="res-name">
                    <Form.Label>{m.registration_name()} *</Form.Label>
                    <Form.Control
                      type="text"
                      isInvalid={showErr}
                      className="bg-dark text-light border-secondary"
                      autoComplete="name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    {showErr && (
                      <Form.Control.Feedback type="invalid">
                        {field.state.meta.errors[0]}
                      </Form.Control.Feedback>
                    )}
                  </Form.Group>
                );
              }}
            </form.Field>

            <form.Field
              name="email"
              validators={{
                onChange: ({ value }) => {
                  if (!value?.trim()) return m.registration_errors_email_required();
                  if (!EMAIL_REGEX.test(value)) return m.registration_errors_email_invalid();
                  return undefined;
                },
              }}
            >
              {(field) => {
                const showErr = field.state.meta.isTouched && field.state.meta.errors.length > 0;
                return (
                  <Form.Group className="mb-3" controlId="res-email">
                    <Form.Label>{m.registration_email()} *</Form.Label>
                    <Form.Control
                      type="email"
                      isInvalid={showErr}
                      className="bg-dark text-light border-secondary"
                      autoComplete="email"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    {showErr && (
                      <Form.Control.Feedback type="invalid">
                        {field.state.meta.errors[0]}
                      </Form.Control.Feedback>
                    )}
                  </Form.Group>
                );
              }}
            </form.Field>

            <form.Field
              name="phone"
              validators={{
                onChange: ({ value }) =>
                  !value?.trim() ? m.registration_errors_phone_required() : undefined,
              }}
            >
              {(field) => {
                const showErr = field.state.meta.isTouched && field.state.meta.errors.length > 0;
                return (
                  <Form.Group className="mb-3" controlId="res-phone">
                    <Form.Label>{m.registration_phone()} *</Form.Label>
                    <Form.Control
                      type="tel"
                      isInvalid={showErr}
                      className="bg-dark text-light border-secondary"
                      autoComplete="tel"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    {showErr && (
                      <Form.Control.Feedback type="invalid">
                        {field.state.meta.errors[0]}
                      </Form.Control.Feedback>
                    )}
                  </Form.Group>
                );
              }}
            </form.Field>

            <form.Field
              name="guestCount"
              validators={{
                onChange: ({ value }) => {
                  if (!value && value !== 0) return m.registration_errors_guests_required();
                  if (value < MIN_GUESTS) return m.registration_errors_guests_min();
                  if (value > MAX_GUESTS) return m.registration_errors_guests_max();
                  return undefined;
                },
              }}
            >
              {(field) => {
                const showErr = field.state.meta.isTouched && field.state.meta.errors.length > 0;
                return (
                  <Form.Group className="mb-3" controlId="res-guests">
                    <Form.Label>{m.registration_guests()} *</Form.Label>
                    <Form.Control
                      type="number"
                      isInvalid={showErr}
                      min={MIN_GUESTS}
                      max={MAX_GUESTS}
                      className="bg-dark text-light border-secondary"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      onBlur={field.handleBlur}
                    />
                    {showErr && (
                      <Form.Control.Feedback type="invalid">
                        {field.state.meta.errors[0]}
                      </Form.Control.Feedback>
                    )}
                  </Form.Group>
                );
              }}
            </form.Field>

            {showOrderItems && (
              <fieldset className="mb-3">
                <legend className="fs-6 fw-semibold mb-1">{m.registration_order_title()}</legend>
                <p className="text-secondary small mb-2">{m.registration_order_description()}</p>
                {requiredProducts.length > 0 && !hasRequiredSelected && (
                  <p className="text-warning small mb-2">
                    {m.registration_order_required_hint({
                      products: requiredProducts.map((p) => p.name).join(", "),
                    })}
                  </p>
                )}

                {products.map((product) => {
                  const currentItem = orderItems.find((o) => o.productId === product.id);
                  const qty = currentItem?.quantity ?? 0;
                  const label = `${product.name} - €${product.price}`;
                  const isLockedOptional =
                    !product.required && requiredProducts.length > 0 && !hasRequiredSelected;
                  const included = includedQuantities.get(product.id);
                  return (
                    <div key={product.id} className="mb-2">
                      <div className="d-flex align-items-center justify-content-between">
                        <span className="text-light small">{label}</span>
                        <div className="d-flex align-items-center gap-2">
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => handleQuantityChange(product.id, qty - 1)}
                            disabled={qty === 0}
                            aria-label={`Decrease quantity of ${label}`}
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
                            disabled={isLockedOptional}
                            aria-label={`Increase quantity of ${label}`}
                          >
                            <i className="bi bi-plus" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                      {included && (
                        <div className="text-secondary" style={{ fontSize: "0.75rem" }}>
                          {m.registration_order_included_note({
                            count: included.quantity,
                            source: included.sourceName,
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </fieldset>
            )}

            <form.Field name="notes">
              {(field) => (
                <Form.Group className="mb-3" controlId="res-notes">
                  <Form.Label>{m.registration_notes()}</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder={m.registration_notes_placeholder()}
                    className="bg-dark text-light border-secondary"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </Form.Group>
              )}
            </form.Field>

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

import {
  CalendarCheckIcon,
  CircleCheckIcon,
  MinusIcon,
  PlusIcon,
  TicketIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useMutation } from "@tanstack/react-query";
import { useForm, useSelector } from "@tanstack/react-form";
import { useState, useCallback, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  PublicCheck,
  PublicDescription,
  PublicError,
  PublicField,
  PublicInput,
  PublicLabel,
  PublicOption,
  PublicSelect,
  PublicTextarea,
} from "@/components/PublicFields";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { MAX_GUESTS, MIN_GUESTS } from "@/config/registration";
import { EMAIL_REGEX } from "@/config/constants";
import type { RegistrationFormData, OrderItem } from "@/types/registration";
import type { Event } from "@/types/event";
import {
  RegistrationSubmitError,
  submitRegistration,
  submitWaitlistEntry,
} from "@/utils/publicRegistrationApi";
import { useAuth } from "@/contexts/AuthContext";
import { getLocale } from "@/paraglide/runtime";

interface RegistrationModalProps {
  show: boolean;
  onHide: () => void;
  event: Event | null;
}

interface RegistrationFields {
  name: string;
  email: string;
  phone: string;
  preferredLanguage: "nl" | "fr" | "en";
  guestCount: number;
  notes: string;
  marketingOptIn: boolean;
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
  // The public API only ever returns purchasable products, and strips any
  // inclusion edge pointing at a hidden one, before this reaches the client
  // (see Event.products) — the `purchasable` filter here is defense in depth
  // only, not something a real payload should ever need.
  const products = useMemo(() => event?.products ?? [], [event]);
  const purchasableProducts = useMemo(() => products.filter((p) => p.purchasable), [products]);
  // Whether guests can order anything is answered by there being a
  // purchasable product, not by a separate flag.
  const showOrderItems = purchasableProducts.length > 0;

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      preferredLanguage: getLocale(),
      guestCount: 1,
      notes: "",
      marketingOptIn: false,
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
          visible: true,
        };

        if (existing) {
          return prev.map((o) => (o.productId === productId ? item : o));
        }
        return [...prev, item];
      });
    },
    [products],
  );

  const guestCount = useSelector(form.atom, (s) => s.values.guestCount);
  const contactName = useSelector(form.atom, (s) => s.values.name);
  const contactEmail = useSelector(form.atom, (s) => s.values.email);
  const contactPhone = useSelector(form.atom, (s) => s.values.phone);
  const contactNotes = useSelector(form.atom, (s) => s.values.notes);

  const [waitlistedProductIds, setWaitlistedProductIds] = useState<Set<string>>(new Set());
  const [waitlistError, setWaitlistError] = useState("");
  // One stable submission id per product, not one shared across every
  // product: a failed/lost response for product A must not have a
  // subsequent join for a different product B silently reuse A's id (the
  // server's ON CONFLICT DO NOTHING would then no-op B's insert while this
  // still reports success and marks B as joined).
  const waitlistSubmissionIds = useRef(new Map<string, string>());
  const joinWaitlistMutation = useMutation({
    mutationFn: (productId: string) => {
      const submissionId = waitlistSubmissionIds.current.get(productId) ?? crypto.randomUUID();
      waitlistSubmissionIds.current.set(productId, submissionId);
      return submitWaitlistEntry(
        {
          productId,
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          guestCount,
          notes: contactNotes,
        },
        submissionId,
      );
    },
    onSuccess: (_data, productId) => {
      waitlistSubmissionIds.current.delete(productId);
      setWaitlistedProductIds((prev) => new Set(prev).add(productId));
    },
    onError: (error) => {
      setWaitlistError(
        error instanceof RegistrationSubmitError ? error.message : m.registration_waitlist_error(),
      );
    },
    retry: false,
  });

  const handleJoinWaitlist = useCallback(
    (productId: string) => {
      setWaitlistError("");
      if (!contactName.trim() || !EMAIL_REGEX.test(contactEmail)) {
        setWaitlistError(m.registration_waitlist_needs_contact_info());
        return;
      }
      joinWaitlistMutation.mutate(productId);
    },
    [contactName, contactEmail, joinWaitlistMutation],
  );

  const requiredProducts = useMemo(
    () => purchasableProducts.filter((p) => p.required),
    [purchasableProducts],
  );
  const hasRequiredSelected = useMemo(
    () => orderItems.some((o) => requiredProducts.some((rp) => rp.id === o.productId)),
    [orderItems, requiredProducts],
  );

  const includedQuantities = useMemo(() => {
    // Every product here is purchasable, and the server strips any inclusion
    // edge targeting a hidden product before it reaches this payload — so an
    // edge present below is always safe to name to the visitor.
    const included = new Map<string, { quantity: number; sourceName: string }>();
    let visits = 0;
    const expand = (id: string, quantity: number, sourceName: string, path: Set<string>) => {
      if (path.has(id) || ++visits > 10000) return;
      const product = products.find((p) => p.id === id);
      if (!product) return;
      const nextPath = new Set([...path, id]);
      const edges =
        product.inclusions ??
        (product.includedProductId && product.includedPerGuests
          ? [
              {
                product_id: product.includedProductId,
                quantity: Math.floor((guestCount || 0) / product.includedPerGuests),
                per_quantity: quantity,
                rounding: "down" as const,
              },
            ]
          : []);
      for (const edge of edges) {
        const value = (quantity * edge.quantity) / edge.per_quantity;
        const count = edge.rounding === "up" ? Math.ceil(value) : Math.floor(value);
        if (count <= 0) continue;
        const old = included.get(edge.product_id);
        included.set(edge.product_id, {
          quantity: (old?.quantity ?? 0) + count,
          sourceName: old ? `${old.sourceName}, ${sourceName}` : sourceName,
        });
        expand(edge.product_id, count, sourceName, nextPath);
      }
    };
    for (const order of orderItems) {
      expand(
        order.productId,
        order.quantity,
        products.find((p) => p.id === order.productId)?.name ?? "",
        new Set(),
      );
    }
    return included;
  }, [guestCount, orderItems, products]);

  const handleClose = useCallback(() => {
    form.reset({
      name: "",
      email: "",
      phone: "",
      preferredLanguage: getLocale(),
      guestCount: 1,
      notes: "",
      marketingOptIn: false,
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
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle id="registration-modal-title">
            <Icon icon={TicketIcon} className="tw:text-warning tw:me-2" />
            {event?.title ?? m.registration_modal_title()}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {!event ? (
            <Alert variant="danger" className="tw:mb-0">
              <Icon icon={TriangleAlertIcon} className="tw:me-2" />
              {m.registration_error()}
            </Alert>
          ) : submitSuccess ? (
            <Alert variant="success" className="tw:mb-0">
              <Icon icon={CircleCheckIcon} className="tw:me-2" />
              {m.registration_success()}
              <div className="tw:mt-2">
                {m.registration_reference({ reference: registrationId })}
              </div>
              <a href="/me" className="alert-link">
                {m.registration_view_my_registrations()}
              </a>
            </Alert>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
              }}
              noValidate
            >
              <form.Field name="honeypot">
                {(field) => (
                  <PublicInput
                    type="text"
                    aria-hidden="true"
                    tabIndex={-1}
                    autoComplete="off"
                    className="tw:hidden"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                )}
              </form.Field>

              <form.Field
                name="name"
                validators={[
                  {
                    run: ({ value }) =>
                      !value?.trim() ? m.registration_errors_name_required() : undefined,
                    triggers: ["change"],
                  },
                ]}
              >
                {(field) => {
                  const showErr = field.meta.isTouched && field.errors.length > 0;
                  return (
                    <PublicField className="tw:mb-4" controlId="res-name">
                      <PublicLabel>{m.registration_name()} *</PublicLabel>
                      <PublicInput
                        type="text"
                        aria-invalid={showErr}
                        autoComplete="name"
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      {showErr && <PublicError>{field.errors[0]?.message}</PublicError>}
                    </PublicField>
                  );
                }}
              </form.Field>

              <form.Field
                name="email"
                validators={[
                  {
                    run: ({ value }) => {
                      if (!value?.trim()) return m.registration_errors_email_required();
                      if (!EMAIL_REGEX.test(value)) return m.registration_errors_email_invalid();
                      return undefined;
                    },
                    triggers: ["change"],
                  },
                ]}
              >
                {(field) => {
                  const showErr = field.meta.isTouched && field.errors.length > 0;
                  return (
                    <PublicField className="tw:mb-4" controlId="res-email">
                      <PublicLabel>{m.registration_email()} *</PublicLabel>
                      <PublicInput
                        type="email"
                        aria-invalid={showErr}
                        autoComplete="email"
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      {showErr && <PublicError>{field.errors[0]?.message}</PublicError>}
                    </PublicField>
                  );
                }}
              </form.Field>

              <form.Field
                name="phone"
                validators={[
                  {
                    run: ({ value }) =>
                      !value?.trim() ? m.registration_errors_phone_required() : undefined,
                    triggers: ["change"],
                  },
                ]}
              >
                {(field) => {
                  const showErr = field.meta.isTouched && field.errors.length > 0;
                  return (
                    <PublicField className="tw:mb-4" controlId="res-phone">
                      <PublicLabel>{m.registration_phone()} *</PublicLabel>
                      <PublicInput
                        type="tel"
                        aria-invalid={showErr}
                        autoComplete="tel"
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      {showErr && <PublicError>{field.errors[0]?.message}</PublicError>}
                    </PublicField>
                  );
                }}
              </form.Field>

              <form.Field
                name="guestCount"
                validators={[
                  {
                    run: ({ value }) => {
                      if (!value && value !== 0) return m.registration_errors_guests_required();
                      if (value < MIN_GUESTS) return m.registration_errors_guests_min();
                      if (value > MAX_GUESTS) return m.registration_errors_guests_max();
                      return undefined;
                    },
                    triggers: ["change"],
                  },
                ]}
              >
                {(field) => {
                  const showErr = field.meta.isTouched && field.errors.length > 0;
                  return (
                    <PublicField className="tw:mb-4" controlId="res-guests">
                      <PublicLabel>{m.registration_guests()} *</PublicLabel>
                      <PublicInput
                        type="number"
                        aria-invalid={showErr}
                        min={MIN_GUESTS}
                        max={MAX_GUESTS}
                        value={field.value}
                        onChange={(e) => field.handleChange(Number(e.target.value))}
                        onBlur={field.handleBlur}
                      />
                      {showErr && <PublicError>{field.errors[0]?.message}</PublicError>}
                    </PublicField>
                  );
                }}
              </form.Field>

              <form.Field name="preferredLanguage">
                {(field) => (
                  <PublicField className="tw:mb-4" controlId="res-preferred-language">
                    <PublicLabel>{m.registration_preferred_language()}</PublicLabel>
                    <PublicSelect
                      value={field.value}
                      onValueChange={(language) =>
                        field.handleChange(language as "nl" | "fr" | "en")
                      }
                    >
                      <PublicOption value="nl">Nederlands</PublicOption>
                      <PublicOption value="fr">Français</PublicOption>
                      <PublicOption value="en">English</PublicOption>
                    </PublicSelect>
                    <PublicDescription>
                      {m.registration_preferred_language_help()}
                    </PublicDescription>
                  </PublicField>
                )}
              </form.Field>

              <form.Field name="marketingOptIn">
                {(field) => (
                  <PublicField className="tw:mb-4" controlId="res-marketing-opt-in">
                    <PublicCheck
                      id="res-marketing-opt-in-check"
                      label={m.registration_marketing_opt_in()}
                      checked={field.value}
                      onCheckedChange={(checked) => field.handleChange(checked)}
                      aria-describedby="res-marketing-opt-in-description"
                    />
                    <PublicDescription>{m.registration_marketing_opt_in_help()}</PublicDescription>
                  </PublicField>
                )}
              </form.Field>

              {showOrderItems && (
                <fieldset className="tw:mb-4">
                  <legend className="tw:text-base tw:font-semibold tw:mb-1">
                    {m.registration_order_title()}
                  </legend>
                  <p className="tw:text-subtle tw:text-sm tw:mb-2">
                    {m.registration_order_description()}
                  </p>
                  {requiredProducts.length > 0 && !hasRequiredSelected && (
                    <p className="tw:text-highlight tw:text-sm tw:mb-2">
                      {m.registration_order_required_hint({
                        products: requiredProducts.map((p) => p.name).join(", "),
                      })}
                    </p>
                  )}

                  {purchasableProducts.map((product) => {
                    const currentItem = orderItems.find((o) => o.productId === product.id);
                    const qty = currentItem?.quantity ?? 0;
                    const label = `${product.name} - €${product.price}`;
                    const isLockedOptional =
                      !product.required && requiredProducts.length > 0 && !hasRequiredSelected;
                    const included = includedQuantities.get(product.id);
                    return (
                      <div key={product.id} className="tw:mb-2">
                        <div className="tw:flex tw:items-center tw:justify-between">
                          <span className="tw:text-foreground tw:text-sm">
                            {label}
                            {product.soldOut && (
                              <>
                                <span className="badge bg-danger tw:ms-2">
                                  {m.registration_order_sold_out()}
                                </span>
                                {waitlistedProductIds.has(product.id) ? (
                                  <span className="badge bg-success tw:ms-2">
                                    {m.registration_waitlist_joined()}
                                  </span>
                                ) : (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="tw:p-0 tw:ms-2 align-baseline"
                                    disabled={joinWaitlistMutation.isPending}
                                    onClick={() => handleJoinWaitlist(product.id)}
                                  >
                                    {m.registration_waitlist_join()}
                                  </Button>
                                )}
                              </>
                            )}
                            {product.description && (
                              <span className="tw:text-subtle tw:block tw:text-xs">
                                {product.description}
                              </span>
                            )}
                          </span>
                          <div className="tw:flex tw:items-center tw:gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuantityChange(product.id, qty - 1)}
                              disabled={qty === 0}
                              aria-label={`Decrease quantity of ${label}`}
                            >
                              <Icon icon={MinusIcon} />
                            </Button>
                            <span className="tw:text-foreground tw:min-w-6 tw:text-center">
                              {qty}
                            </span>
                            <Button
                              variant="outline-warning"
                              size="sm"
                              onClick={() => handleQuantityChange(product.id, qty + 1)}
                              disabled={
                                isLockedOptional ||
                                product.soldOut ||
                                (product.availableQuantity != null &&
                                  qty + (included?.quantity ?? 0) >= product.availableQuantity)
                              }
                              aria-label={`Increase quantity of ${label}`}
                            >
                              <Icon icon={PlusIcon} />
                            </Button>
                          </div>
                        </div>
                        {product.availableQuantity != null && (
                          <div className="tw:text-subtle tw:text-sm">
                            {m.registration_order_available()}: {product.availableQuantity}
                          </div>
                        )}
                        {included && (
                          <div className="tw:text-subtle tw:text-xs">
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

              {waitlistError && (
                <Alert variant="danger" className="tw:py-2 tw:text-sm">
                  {waitlistError}
                </Alert>
              )}

              <form.Field name="notes">
                {(field) => (
                  <PublicField className="tw:mb-4" controlId="res-notes">
                    <PublicLabel>{m.registration_notes()}</PublicLabel>
                    <PublicTextarea
                      rows={3}
                      maxLength={4000}
                      placeholder={m.registration_notes_placeholder()}
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <PublicDescription>{m.registration_notes_help()}</PublicDescription>
                  </PublicField>
                )}
              </form.Field>

              {submitError && (
                <Alert variant="danger" className="tw:mb-4">
                  <Icon icon={TriangleAlertIcon} className="tw:me-2" />
                  {submitError}
                </Alert>
              )}

              <Button
                type="submit"
                variant="warning"
                className="tw:w-full"
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
                      className="tw:me-2"
                    />
                    {m.registration_submitting()}
                  </>
                ) : (
                  <>
                    <Icon icon={CalendarCheckIcon} className="tw:me-2" />
                    {m.registration_submit()}
                  </>
                )}
              </Button>
            </form>
          )}
        </DialogBody>

        {submitSuccess && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {m.close()}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

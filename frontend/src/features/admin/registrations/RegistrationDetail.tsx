import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OrderAnswerSummary } from "@/components/OrderAnswers";
import {
  AdminField,
  AdminLabel,
  AdminSelect,
  AdminOption,
  AdminInput,
} from "@/components/admin/AdminFields";
import {
  CircleCheckIcon,
  ContactRoundIcon,
  LogInIcon,
  MailIcon,
  MinusIcon,
  PlusIcon,
  QrCodeIcon,
  ShoppingBasketIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  UserIcon,
  UserRoundCogIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { m } from "@/paraglide/messages";
import type { FloorTable } from "@/api-types";
import type { PaymentTransactionCreate } from "@/api-types";
import type { OrderItemOut } from "@/api-types";
import { remainingQuantity, type BookingUpdate, type Registration } from "@/types/registration";
import { toAmount } from "../shared/money";
import {
  buildRegistrationEmailDraft,
  type EmailDraft,
  type RegistrationEmailTemplate,
} from "../shared/emailComposer";
import BookingEditor from "./BookingEditor";
import EmailComposeModal from "../shared/EmailComposeModal";

interface RegistrationDetailProps {
  registration: Registration | null;
  /** Every currently-known registration, used to compute remaining table capacity in the booking editor. */
  registrations?: Registration[];
  authHeaders: () => Record<string, string>;
  /** Full origin + router basename (e.g. `https://example.com`). Used to build the check-in QR code URL. */
  baseUrl: string;
  /** Other people sharing the same email address, shown in the merge-duplicate alert. */
  emailDuplicates?: { id: string; name: string }[];
  tables?: FloorTable[] | null;
  onClose: () => void;
  onToggleDelivered: (registrationId: string, updatedOrders: OrderItemOut[]) => void;
  onCheckIn: (registrationId: string) => void;
  onIssueStrap: (registrationId: string) => void;
  onSaveBooking?: (registrationId: string, update: BookingUpdate) => Promise<void>;
  onAddTransaction?: (
    registrationId: string,
    payload: PaymentTransactionCreate,
  ) => Promise<unknown>;
  onMergeDuplicate?: (canonicalId: string, duplicateId: string) => void;
  actionError?: string;
  onClearActionError?: () => void;
}

function isSimpleRsvp(registration: Registration) {
  if (!registration.event || !registration.event.edition) return false;
  return registration.event.edition.edition_type !== "festival";
}

export default function RegistrationDetail({
  registration,
  registrations = [],
  authHeaders,
  baseUrl,
  emailDuplicates = [],
  tables = [],
  onClose,
  onToggleDelivered,
  onCheckIn,
  onIssueStrap,
  onSaveBooking,
  onAddTransaction,
  onMergeDuplicate,
  actionError,
  onClearActionError,
}: RegistrationDetailProps) {
  const isOnline = useOnlineStatus();
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [emailTemplate, setEmailTemplate] = useState<RegistrationEmailTemplate>("general");
  const checkInUrl = registration
    ? `${baseUrl}/check-in?id=${encodeURIComponent(registration.id)}#token=${encodeURIComponent(registration.check_in_token ?? "")}`
    : "";

  const sortedTables = useMemo(
    () =>
      [...(tables ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [tables],
  );

  const handleSetDeliveredQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (!isOnline || !registration || !Number.isFinite(quantity)) return;
      const updatedOrders = registration.order_items.map((item) => {
        if (item.product_id !== productId) return item;
        // The input is the admin's, so it is clamped here; the API rejects anything outside [0, quantity].
        const deliveredQuantity = Math.max(0, Math.min(item.quantity, Math.trunc(quantity)));
        return {
          ...item,
          delivered_quantity: deliveredQuantity,
          delivered: deliveredQuantity === item.quantity,
        };
      });
      onToggleDelivered(registration.id, updatedOrders);
    },
    [isOnline, registration, onToggleDelivered],
  );

  const handleAdjustDeliveredQuantity = useCallback(
    (productId: string, delta: number) => {
      if (!registration) return;
      const item = registration.order_items.find((order) => order.product_id === productId);
      if (!item) return;
      handleSetDeliveredQuantity(productId, item.delivered_quantity + delta);
    },
    [handleSetDeliveredQuantity, registration],
  );

  if (!registration) return null;
  const simpleRsvp = isSimpleRsvp(registration);
  const paid = toAmount(registration.amount_paid);
  const balance = Math.max(0, toAmount(registration.amount_due) - paid);
  const refund = toAmount(registration.refund_due);
  const changedPrices = registration.order_items.flatMap((item) => {
    const current = registration.event?.products?.find((product) => product.id === item.product_id);
    return current && Number(current.price) !== item.price && item.quantity > item.included_quantity
      ? [{ name: item.name, booked: item.price, current: current.price }]
      : [];
  });

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle id="res-detail-modal-title">
            <Icon icon={UserIcon} className="me-2" />
            {registration.person.name}
          </DialogTitle>
          <p className="text-sm text-subtle">
            {registration.event?.title ?? registration.event_id} · {m.admin_guests_count()}:{" "}
            {registration.guest_count}
          </p>
          <p className="text-sm">
            {m.admin_inventory_paid()}: €{paid.toFixed(2)} ·{" "}
            {refund > 0 ? m.admin_inventory_refund() : m.admin_booking_balance()}: €
            {(refund > 0 ? refund : balance).toFixed(2)}
          </p>
          <nav className="flex flex-wrap gap-2" aria-label={m.admin_booking_editor()}>
            {onSaveBooking && (
              <a className="text-primary underline" href="#registration-booking">
                {m.admin_booking_editor()}
              </a>
            )}
            {onSaveBooking && (
              <>
                <a className="text-primary underline" href="#registration-seating">
                  {m.admin_action_assign_table()}
                </a>
                <a className="text-primary underline" href="#registration-payments">
                  {m.admin_booking_payments()}
                </a>
              </>
            )}
            {registration.person.email && (
              <a className="text-primary underline" href="#registration-email-heading">
                {m.admin_email_registration_title()}
              </a>
            )}
            {!simpleRsvp && registration.order_items.length > 0 && (
              <a className="text-primary underline" href="#registration-fulfillment">
                {m.admin_bottle_fulfillment()}
              </a>
            )}
            <a className="text-primary underline" href="#registration-entrance">
              {m.admin_check_in_title()}
            </a>
            {registration.check_in_token && (
              <a className="text-primary underline" href="#registration-qr">
                {m.admin_qr_code()}
              </a>
            )}
          </nav>
        </DialogHeader>

        <DialogBody>
          {!isOnline && (
            <Alert variant="warning" role="status">
              {m.checkin_offline_banner()}
            </Alert>
          )}
          {toAmount(registration.refund_due) > 0 && (
            <Alert variant="warning">
              {m.admin_inventory_refund()}: €{toAmount(registration.refund_due).toFixed(2)}
            </Alert>
          )}
          {changedPrices.length > 0 && (
            <Alert variant="info">
              {m.admin_inventory_price_difference()}
              {changedPrices.map((price) => (
                <div key={price.name}>
                  {price.name}: €{price.booked.toFixed(2)} → €{Number(price.current).toFixed(2)}
                </div>
              ))}
            </Alert>
          )}
          <EmailComposeModal draft={emailDraft} onClose={() => setEmailDraft(null)} />
          {actionError && (
            <Alert variant="danger" onClose={onClearActionError} className="mb-4" role="alert">
              {actionError}
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            <Badge
              variant={
                registration.status === "confirmed"
                  ? "success"
                  : registration.status === "cancelled"
                    ? "danger"
                    : "warning"
              }
            >
              {registration.status === "confirmed"
                ? m.admin_status_confirmed()
                : registration.status === "cancelled"
                  ? m.admin_status_cancelled()
                  : m.admin_status_pending()}
            </Badge>
            <Badge
              variant={
                registration.payment_status === "paid"
                  ? "success"
                  : registration.payment_status === "partial"
                    ? "warning"
                    : "secondary"
              }
            >
              {registration.payment_status === "paid"
                ? m.admin_payment_paid()
                : registration.payment_status === "partial"
                  ? m.admin_payment_partial()
                  : m.admin_payment_unpaid()}
            </Badge>
            {registration.checked_in ? (
              <Badge variant="success">
                <Icon icon={CircleCheckIcon} className="me-1" />
                {m.admin_checked_in()}
                {registration.checked_in_at && (
                  <span className="ms-1 font-normal">
                    {new Date(registration.checked_in_at).toLocaleTimeString()}
                  </span>
                )}
              </Badge>
            ) : (
              <Badge variant="secondary">{m.admin_not_checked_in()}</Badge>
            )}
            {!simpleRsvp &&
              (registration.strap_issued ? (
                <Badge variant="info">
                  <Icon icon={ContactRoundIcon} className="me-1" />
                  {m.admin_strap_issued()}
                </Badge>
              ) : (
                <Badge variant="secondary">{m.admin_strap_not_issued()}</Badge>
              ))}
          </div>

          {emailDuplicates.length > 0 && (
            <Alert variant="warning" className="py-2 mb-4">
              <div className="font-semibold mb-1">
                <Icon icon={TriangleAlertIcon} className="me-1" />
                {m.admin_people_duplicates_title()}
              </div>
              <div className="text-sm mb-2">{m.admin_people_duplicates_same_email()}</div>
              <div className="flex flex-wrap gap-2">
                {emailDuplicates.map((dup) => (
                  <Button
                    key={dup.id}
                    size="sm"
                    variant="warning"
                    onClick={() => onMergeDuplicate?.(registration.person_id, dup.id)}
                  >
                    <Icon icon={UserRoundCogIcon} />
                    {m.admin_people_merge_title()}: {dup.name}
                  </Button>
                ))}
              </div>
            </Alert>
          )}

          <PresentationList flush className="mb-4">
            <PresentationListItem className="flex justify-between">
              <span className="text-subtle">{m.registration_email()}</span>
              <a href={`mailto:${registration.person.email}`} className="text-highlight">
                {registration.person.email}
              </a>
            </PresentationListItem>
            {!onSaveBooking && (
              <PresentationListItem className="flex justify-between">
                <span className="text-subtle">{m.admin_guests_count()}</span>
                <span aria-label={m.admin_guests_count()}>{registration.guest_count}</span>
              </PresentationListItem>
            )}
            <PresentationListItem className="flex justify-between">
              <span className="text-subtle">{m.registration_phone()}</span>
              <span>{registration.person.phone}</span>
            </PresentationListItem>
            <PresentationListItem className="flex justify-between">
              <span className="text-subtle">{m.admin_event_label()}</span>
              <span>{registration.event?.title ?? registration.event_id}</span>
            </PresentationListItem>
            <PresentationListItem className="flex justify-between">
              <span className="text-subtle">{m.registration_edition_type_label()}</span>
              <span>
                {(() => {
                  const et = registration.event?.edition?.edition_type;
                  if (et === "bourse") return m.admin_edition_type_bourse();
                  if (et === "capsule_exchange") return m.admin_edition_type_capsule_exchange();
                  return m.admin_edition_type_festival();
                })()}
              </span>
            </PresentationListItem>
            {onSaveBooking && (
              <PresentationListItem
                className="border-border"
                id="registration-booking"
                tabIndex={-1}
              >
                <BookingEditor
                  key={`${registration.id}:${registration.updated_at}`}
                  registration={registration}
                  registrations={registrations}
                  authHeaders={authHeaders}
                  tables={sortedTables}
                  onSave={onSaveBooking}
                  onAddTransaction={onAddTransaction}
                />
              </PresentationListItem>
            )}
            {!onSaveBooking && <OrderAnswerSummary answers={registration.order_answers} />}
            {!onSaveBooking && registration.notes && (
              <PresentationListItem className="border-border">
                <span className="text-subtle block mb-1">{m.admin_notes()}</span>
                <span className="text-sm">{registration.notes}</span>
              </PresentationListItem>
            )}
          </PresentationList>

          {registration.person.email && (
            <section className="mb-6" aria-labelledby="registration-email-heading">
              <h3
                id="registration-email-heading"
                tabIndex={-1}
                className="text-base font-medium text-highlight mb-2"
              >
                <Icon icon={MailIcon} className="me-2" />
                {m.admin_email_registration_title()}
              </h3>
              <div className="flex flex-wrap items-end gap-2">
                <AdminField controlId="registration-email-template" className="grow">
                  <AdminLabel>{m.admin_email_template_label()}</AdminLabel>
                  <AdminSelect
                    value={emailTemplate}
                    onValueChange={(event) => setEmailTemplate(event as RegistrationEmailTemplate)}
                  >
                    <AdminOption value="general">{m.admin_email_template_general()}</AdminOption>
                    <AdminOption value="order">{m.admin_email_template_order()}</AdminOption>
                    <AdminOption value="payment">{m.admin_email_template_payment()}</AdminOption>
                    <AdminOption value="event">{m.admin_email_template_event()}</AdminOption>
                  </AdminSelect>
                </AdminField>
                <Button
                  variant="outline-warning"
                  onClick={() =>
                    setEmailDraft(buildRegistrationEmailDraft(registration, emailTemplate))
                  }
                >
                  {m.admin_email_preview_action()}
                </Button>
              </div>
            </section>
          )}

          {!simpleRsvp && registration.order_items.length > 0 && (
            <div className="mb-6">
              <h3
                id="registration-fulfillment"
                tabIndex={-1}
                className="text-base font-medium text-highlight mb-2"
              >
                <Icon icon={ShoppingBasketIcon} className="me-2" />
                {m.admin_bottle_fulfillment()}
              </h3>
              <PresentationList>
                {registration.order_items.map((item) => (
                  <PresentationListItem
                    key={item.product_id}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <span>
                      {item.name}{" "}
                      <Badge variant="secondary" className="ms-1">
                        ×{item.quantity}
                      </Badge>
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.delivered ? "success" : "secondary"}>
                        {m.admin_bottle_delivered()}: {item.delivered_quantity}/{item.quantity}
                      </Badge>
                      <Badge variant={remainingQuantity(item) > 0 ? "warning" : "success"}>
                        {m.admin_bottle_not_delivered()}: {remainingQuantity(item)}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdjustDeliveredQuantity(item.product_id, -1)}
                          disabled={!isOnline || item.delivered_quantity <= 0}
                          title={m.admin_mark_not_delivered()}
                          aria-label={`${m.admin_mark_not_delivered()}: ${item.name}`}
                        >
                          <Icon icon={MinusIcon} />
                        </Button>
                        <AdminInput
                          key={item.delivered_quantity}
                          disabled={!isOnline}
                          aria-label={`${m.admin_bottle_delivered()} ${item.name}`}
                          className="text-center w-20"
                          inputMode="numeric"
                          min={0}
                          max={item.quantity}
                          onBlur={(event) => {
                            const value = Number(event.currentTarget.value);
                            if (Number.isFinite(value)) {
                              const bounded = Math.max(
                                0,
                                Math.min(item.quantity, Math.trunc(value)),
                              );
                              event.currentTarget.value = String(bounded);
                              if (bounded !== item.delivered_quantity) {
                                handleSetDeliveredQuantity(item.product_id, bounded);
                              }
                            } else {
                              event.currentTarget.value = String(item.delivered_quantity);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                          size="sm"

                          type="number"
                          defaultValue={item.delivered_quantity}
                        />
                        <Button
                          size="sm"
                          variant={item.delivered ? "success" : "outline-success"}
                          onClick={() => handleAdjustDeliveredQuantity(item.product_id, 1)}
                          disabled={!isOnline || item.delivered_quantity >= item.quantity}
                          title={m.admin_mark_delivered()}
                          aria-label={`${m.admin_mark_delivered()}: ${item.name}`}
                        >
                          <Icon icon={PlusIcon} />
                        </Button>
                      </div>
                    </div>
                  </PresentationListItem>
                ))}
              </PresentationList>
            </div>
          )}

          <div className="mb-6">
            <h3
              id="registration-entrance"
              tabIndex={-1}
              className="text-base font-medium text-highlight mb-2"
            >
              <Icon icon={UserCheckIcon} className="me-2" />
              {m.admin_check_in_title()}
            </h3>
            <div className="flex gap-2 flex-wrap">
              {!registration.checked_in && (
                <Button
                  variant="outline-success"
                  size="sm"
                  disabled={!isOnline}
                  onClick={() => onCheckIn(registration.id)}
                >
                  <Icon icon={LogInIcon} />
                  {m.admin_mark_checked_in()}
                </Button>
              )}
              {!simpleRsvp && !registration.strap_issued && (
                <Button
                  variant="outline-info"
                  size="sm"
                  disabled={!isOnline}
                  onClick={() => onIssueStrap(registration.id)}
                >
                  <Icon icon={ContactRoundIcon} />
                  {m.admin_issue_strap()}
                </Button>
              )}
            </div>
          </div>

          {registration.check_in_token && (
            <div className="text-center">
              <h3
                id="registration-qr"
                tabIndex={-1}
                className="text-base font-medium text-highlight mb-2"
              >
                <Icon icon={QrCodeIcon} className="me-2" />
                {m.admin_qr_code()}
              </h3>
              <p className="text-subtle text-sm mb-4">{m.admin_qr_scan_info()}</p>
              <div className="inline-block rounded-md bg-white p-4">
                <QRCodeSVG value={checkInUrl} size={180} level="M" includeMargin={false} />
              </div>
              <div className="mt-2">
                <a
                  href={checkInUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-subtle text-sm break-words"
                >
                  {checkInUrl}
                </a>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {m.close()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

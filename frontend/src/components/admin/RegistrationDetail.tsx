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
import type { FloorTable } from "@/types/admin";
import type {
  BookingUpdate,
  OrderItem,
  PaymentTransactionCreate,
  Registration,
} from "@/types/registration";
import {
  buildRegistrationEmailDraft,
  type EmailDraft,
  type RegistrationEmailTemplate,
} from "@/utils/emailComposer";
import BookingEditor from "./BookingEditor";
import EmailComposeModal from "./EmailComposeModal";

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
  onToggleDelivered: (registrationId: string, updatedOrders: OrderItem[]) => void;
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
  return registration.event.edition.editionType !== "festival";
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
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [emailTemplate, setEmailTemplate] = useState<RegistrationEmailTemplate>("general");
  const checkInUrl = registration
    ? `${baseUrl}/check-in?id=${encodeURIComponent(registration.id)}#token=${encodeURIComponent(registration.checkInToken ?? "")}`
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
      if (!registration || !Number.isFinite(quantity)) return;
      const updatedOrders = registration.orderItems.map((item) => {
        if (item.productId !== productId) return item;
        const deliveredQuantity = Math.max(0, Math.min(item.quantity, Math.trunc(quantity)));
        return {
          ...item,
          deliveredQuantity,
          remainingQuantity: item.quantity - deliveredQuantity,
          delivered: deliveredQuantity === item.quantity,
        };
      });
      onToggleDelivered(registration.id, updatedOrders);
    },
    [registration, onToggleDelivered],
  );

  const handleAdjustDeliveredQuantity = useCallback(
    (productId: string, delta: number) => {
      if (!registration) return;
      const item = registration.orderItems.find((order) => order.productId === productId);
      if (!item) return;
      handleSetDeliveredQuantity(productId, item.deliveredQuantity + delta);
    },
    [handleSetDeliveredQuantity, registration],
  );

  if (!registration) return null;
  const simpleRsvp = isSimpleRsvp(registration);
  const changedPrices = registration.orderItems.flatMap((item) => {
    const current = registration.event?.products?.find((product) => product.id === item.productId);
    return current && current.price !== item.price && item.quantity > item.includedQuantity
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
            <Icon icon={UserIcon} className="tw:me-2" />
            {registration.person.name}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {(registration.refundDue ?? 0) > 0 && (
            <Alert variant="warning">
              {m.admin_inventory_refund()}: €{registration.refundDue?.toFixed(2)}
            </Alert>
          )}
          {changedPrices.length > 0 && (
            <Alert variant="info">
              {m.admin_inventory_price_difference()}
              {changedPrices.map((price) => (
                <div key={price.name}>
                  {price.name}: €{price.booked.toFixed(2)} → €{price.current.toFixed(2)}
                </div>
              ))}
            </Alert>
          )}
          <EmailComposeModal draft={emailDraft} onClose={() => setEmailDraft(null)} />
          {actionError && (
            <Alert variant="danger" onClose={onClearActionError} className="tw:mb-4" role="alert">
              {actionError}
            </Alert>
          )}

          <div className="tw:flex tw:flex-wrap tw:gap-2 tw:mb-4">
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
                registration.paymentStatus === "paid"
                  ? "success"
                  : registration.paymentStatus === "partial"
                    ? "warning"
                    : "secondary"
              }
            >
              {registration.paymentStatus === "paid"
                ? m.admin_payment_paid()
                : registration.paymentStatus === "partial"
                  ? m.admin_payment_partial()
                  : m.admin_payment_unpaid()}
              {registration.amountDue != null && (
                <span className="tw:ms-1 tw:font-normal">
                  {m.admin_registration_amount_due({
                    amount: registration.amountDue.toFixed(2),
                  })}
                </span>
              )}
            </Badge>
            {registration.checkedIn ? (
              <Badge variant="success">
                <Icon icon={CircleCheckIcon} className="tw:me-1" />
                {m.admin_checked_in()}
                {registration.checkedInAt && (
                  <span className="tw:ms-1 tw:font-normal">
                    {new Date(registration.checkedInAt).toLocaleTimeString()}
                  </span>
                )}
              </Badge>
            ) : (
              <Badge variant="secondary">{m.admin_not_checked_in()}</Badge>
            )}
            {!simpleRsvp &&
              (registration.strapIssued ? (
                <Badge variant="info">
                  <Icon icon={ContactRoundIcon} className="tw:me-1" />
                  {m.admin_strap_issued()}
                </Badge>
              ) : (
                <Badge variant="secondary">{m.admin_strap_not_issued()}</Badge>
              ))}
          </div>

          {emailDuplicates.length > 0 && (
            <Alert variant="warning" className="tw:py-2 tw:mb-4">
              <div className="tw:font-semibold tw:mb-1">
                <Icon icon={TriangleAlertIcon} className="tw:me-1" />
                {m.admin_people_duplicates_title()}
              </div>
              <div className="tw:text-sm tw:mb-2">{m.admin_people_duplicates_same_email()}</div>
              <div className="tw:flex tw:flex-wrap tw:gap-2">
                {emailDuplicates.map((dup) => (
                  <Button
                    key={dup.id}
                    size="sm"
                    variant="warning"
                    onClick={() => onMergeDuplicate?.(registration.personId, dup.id)}
                  >
                    <Icon icon={UserRoundCogIcon} />
                    {m.admin_people_merge_title()}: {dup.name}
                  </Button>
                ))}
              </div>
            </Alert>
          )}

          <PresentationList flush className="tw:mb-4">
            <PresentationListItem className="tw:flex tw:justify-between">
              <span className="tw:text-subtle">{m.registration_email()}</span>
              <a href={`mailto:${registration.person.email}`} className="tw:text-highlight">
                {registration.person.email}
              </a>
            </PresentationListItem>
            {!onSaveBooking && (
              <PresentationListItem className="tw:flex tw:justify-between">
                <span className="tw:text-subtle">{m.admin_guests_count()}</span>
                <span aria-label={m.admin_guests_count()}>{registration.guestCount}</span>
              </PresentationListItem>
            )}
            <PresentationListItem className="tw:flex tw:justify-between">
              <span className="tw:text-subtle">{m.registration_phone()}</span>
              <span>{registration.person.phone}</span>
            </PresentationListItem>
            <PresentationListItem className="tw:flex tw:justify-between">
              <span className="tw:text-subtle">{m.admin_event_label()}</span>
              <span>{registration.event?.title ?? registration.eventId}</span>
            </PresentationListItem>
            <PresentationListItem className="tw:flex tw:justify-between">
              <span className="tw:text-subtle">{m.registration_edition_type_label()}</span>
              <span>
                {(() => {
                  const et = registration.event?.edition?.editionType;
                  if (et === "bourse") return m.admin_edition_type_bourse();
                  if (et === "capsule_exchange") return m.admin_edition_type_capsule_exchange();
                  return m.admin_edition_type_festival();
                })()}
              </span>
            </PresentationListItem>
            {onSaveBooking && (
              <PresentationListItem className="tw:border-border">
                <BookingEditor
                  key={`${registration.id}:${registration.updatedAt}`}
                  registration={registration}
                  registrations={registrations}
                  authHeaders={authHeaders}
                  tables={sortedTables}
                  onSave={onSaveBooking}
                  onAddTransaction={onAddTransaction}
                />
              </PresentationListItem>
            )}
            {!onSaveBooking && registration.notes && (
              <PresentationListItem className="tw:border-border">
                <span className="tw:text-subtle tw:block tw:mb-1">{m.admin_notes()}</span>
                <span className="tw:text-sm">{registration.notes}</span>
              </PresentationListItem>
            )}
          </PresentationList>

          {registration.person.email && (
            <section className="tw:mb-6" aria-labelledby="registration-email-heading">
              <h6 id="registration-email-heading" className="tw:text-highlight tw:mb-2">
                <Icon icon={MailIcon} className="tw:me-2" />
                {m.admin_email_registration_title()}
              </h6>
              <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-2">
                <AdminField controlId="registration-email-template" className="tw:grow">
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

          {!simpleRsvp && registration.orderItems.length > 0 && (
            <div className="tw:mb-6">
              <h6 className="tw:text-highlight tw:mb-2">
                <Icon icon={ShoppingBasketIcon} className="tw:me-2" />
                {m.admin_bottle_fulfillment()}
              </h6>
              <PresentationList>
                {registration.orderItems.map((item) => (
                  <PresentationListItem
                    key={item.productId}
                    className="tw:flex tw:items-center tw:justify-between"
                  >
                    <span>
                      {item.name}{" "}
                      <Badge variant="secondary" className="tw:ms-1">
                        ×{item.quantity}
                      </Badge>
                    </span>
                    <div className="tw:flex tw:items-center tw:gap-2">
                      <Badge variant={item.delivered ? "success" : "secondary"}>
                        {m.admin_bottle_delivered()}: {item.deliveredQuantity}/{item.quantity}
                      </Badge>
                      <Badge variant={item.remainingQuantity > 0 ? "warning" : "success"}>
                        {m.admin_bottle_not_delivered()}: {item.remainingQuantity}
                      </Badge>
                      <div className="tw:flex tw:items-center tw:gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdjustDeliveredQuantity(item.productId, -1)}
                          disabled={item.deliveredQuantity <= 0}
                          title={m.admin_mark_not_delivered()}
                        >
                          <Icon icon={MinusIcon} />
                        </Button>
                        <AdminInput
                          key={item.deliveredQuantity}
                          aria-label={`${m.admin_bottle_delivered()} ${item.name}`}
                          className="tw:text-center tw:w-20"
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
                              if (bounded !== item.deliveredQuantity) {
                                handleSetDeliveredQuantity(item.productId, bounded);
                              }
                            } else {
                              event.currentTarget.value = String(item.deliveredQuantity);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                          size="sm"

                          type="number"
                          defaultValue={item.deliveredQuantity}
                        />
                        <Button
                          size="sm"
                          variant={item.delivered ? "success" : "outline-success"}
                          onClick={() => handleAdjustDeliveredQuantity(item.productId, 1)}
                          disabled={item.deliveredQuantity >= item.quantity}
                          title={m.admin_mark_delivered()}
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

          <div className="tw:mb-6">
            <h6 className="tw:text-highlight tw:mb-2">
              <Icon icon={UserCheckIcon} className="tw:me-2" />
              {m.admin_check_in_title()}
            </h6>
            <div className="tw:flex tw:gap-2 tw:flex-wrap">
              {!registration.checkedIn && (
                <Button
                  variant="outline-success"
                  size="sm"
                  onClick={() => onCheckIn(registration.id)}
                >
                  <Icon icon={LogInIcon} />
                  {m.admin_mark_checked_in()}
                </Button>
              )}
              {!simpleRsvp && !registration.strapIssued && (
                <Button
                  variant="outline-info"
                  size="sm"
                  onClick={() => onIssueStrap(registration.id)}
                >
                  <Icon icon={ContactRoundIcon} />
                  {m.admin_issue_strap()}
                </Button>
              )}
            </div>
          </div>

          {registration.checkInToken && (
            <div className="tw:text-center">
              <h6 className="tw:text-highlight tw:mb-2">
                <Icon icon={QrCodeIcon} className="tw:me-2" />
                {m.admin_qr_code()}
              </h6>
              <p className="tw:text-subtle tw:text-sm tw:mb-4">{m.admin_qr_scan_info()}</p>
              <div className="tw:inline-block tw:rounded-md tw:bg-white tw:p-4">
                <QRCodeSVG value={checkInUrl} size={180} level="M" includeMargin={false} />
              </div>
              <div className="tw:mt-2">
                <a
                  href={checkInUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tw:text-subtle tw:text-sm tw:break-words"
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

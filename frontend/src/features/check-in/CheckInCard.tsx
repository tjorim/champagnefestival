import { getLocale } from "@/paraglide/runtime";
import { formatTime } from "@/lib/format/dateUtils";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ContactRoundIcon,
  InfoIcon,
  MapIcon,
  MinusIcon,
  OctagonXIcon,
  PlusIcon,
  ScanQrCodeIcon,
  ShoppingCartIcon,
  UserCheckIcon,
  UserIcon,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PublicInput } from "@/components/PublicFields";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import { m } from "@/paraglide/messages";
import { type CheckInData } from "@/lib/api/publicRegistrationApi";

interface CheckInCardProps {
  registration: CheckInData;
  success: boolean;
  isAlreadyCheckedIn: boolean;
  isCheckingIn: boolean;
  isOnline: boolean;
  isUpdatingRegistration: boolean;
  canManageEntranceActions: boolean;
  onCheckIn: () => void;
  onAdjustOrderItem: (product_id: string, delta: number) => void;
  onSetOrderItemQuantity: (product_id: string, quantity: number) => void;
  onIssueStrap: () => void;
  onReturnToScanner: () => void;
}

export function CheckInCard({
  registration,
  success,
  isAlreadyCheckedIn,
  isCheckingIn,
  isOnline,
  isUpdatingRegistration,
  canManageEntranceActions,
  onCheckIn,
  onAdjustOrderItem,
  onSetOrderItemQuantity,
  onIssueStrap,
  onReturnToScanner,
}: CheckInCardProps) {
  const isCancelled = registration.status === "cancelled";
  const canUpdateEntrance = canManageEntranceActions && !isCancelled && isOnline;
  return (
    <Card tone={success ? "success" : isAlreadyCheckedIn ? "warning" : "secondary"}>
      <CardHeader
        className={cn(
          "flex items-center justify-between gap-4 flex-wrap",
          success ? "border-success" : isAlreadyCheckedIn ? "border-warning" : "border-border",
        )}
      >
        <span className="font-semibold text-xl">
          <Icon icon={UserIcon} className="me-2" />
          {registration.name}
        </span>
        <div className="flex gap-2 flex-wrap">
          {!success && (
            <Button variant="outline" size="sm" onClick={onReturnToScanner}>
              <ScanQrCodeIcon className="size-4" aria-hidden="true" />
              {m.checkin_scan_next()}
            </Button>
          )}
          <Badge
            variant={
              isCancelled ? "danger" : registration.status === "confirmed" ? "success" : "warning"
            }
          >
            {isCancelled
              ? m.admin_status_cancelled()
              : registration.status === "confirmed"
                ? m.admin_status_confirmed()
                : m.admin_status_pending()}
          </Badge>
          <Badge variant={registration.checked_in ? "success" : "secondary"}>
            {registration.checked_in && <Icon icon={CircleCheckIcon} className="me-1" />}
            {registration.checked_in ? m.admin_checked_in() : m.checkin_manual_not_checked_in()}
          </Badge>
          {registration.strap_issued && (
            <Badge variant="info">
              <Icon icon={ContactRoundIcon} className="me-1" />
              {m.admin_strap_issued()}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div role="status" aria-live="polite">
          {success && (
            <Alert variant="success" className="mb-4">
              <div className="flex justify-between items-center gap-4 flex-wrap">
                <span>
                  <Icon icon={CircleCheckIcon} className="me-2" />
                  <strong>{m.checkin_success()}</strong>
                  {registration.strap_issued && (
                    <div className="mt-1">{m.checkin_strap_issued()}</div>
                  )}
                </span>
                <Button variant="outline-success" size="sm" onClick={onReturnToScanner}>
                  <Icon icon={ScanQrCodeIcon} />
                  {m.checkin_scan_next()}
                </Button>
              </div>
            </Alert>
          )}
        </div>
        {canManageEntranceActions && registration.edition_id && registration.table_id && (
          <ButtonLink
            render={
              <Link
                to="/venue-plan"
                search={{
                  edition: registration.edition_id,
                  table: registration.table_id,
                  registration: registration.id,
                }}
              />
            }
            variant="outline-warning"
            className="w-full mb-4"
          >
            <Icon icon={MapIcon} />
            {m.venue_plan_show_table()}
          </ButtonLink>
        )}

        <div role="alert" aria-live="assertive">
          {isCancelled && (
            <Alert variant="danger" className="mb-4">
              <Icon icon={OctagonXIcon} className="me-2" />
              {m.admin_status_cancelled()}
            </Alert>
          )}
          {isAlreadyCheckedIn && !success && registration.checked_in_at && (
            <Alert variant="warning" className="mb-4">
              <Icon icon={CircleAlertIcon} className="me-2" />
              {m.checkin_already_in()} {formatTime(registration.checked_in_at, getLocale())}
            </Alert>
          )}
        </div>

        <PresentationList flush className="bg-card">
          <PresentationListItem className="flex justify-between gap-4">
            <span className="text-subtle">{m.checkin_event()}</span>
            <span className="text-right">{registration.event_title || registration.event_id}</span>
          </PresentationListItem>
          <PresentationListItem className="flex justify-between gap-4">
            <span className="text-subtle">{m.checkin_guests()}</span>
            <span>{registration.guest_count}</span>
          </PresentationListItem>
          {registration.table_name && (
            <PresentationListItem className="flex justify-between gap-4">
              <span className="text-subtle">{m.checkin_table()}</span>
              <span className="font-semibold text-highlight">{registration.table_name}</span>
            </PresentationListItem>
          )}
        </PresentationList>

        {!isCancelled && (!registration.checked_in || !registration.strap_issued) && (
          <div className="my-4 grid gap-2">
            {!registration.checked_in && (
              <Button
                variant="warning"
                className="h-auto w-full whitespace-normal"
                onClick={onCheckIn}
                disabled={isCheckingIn || !isOnline}
              >
                {isCheckingIn ? (
                  <Spinner size="sm" role="status" aria-hidden="true" />
                ) : (
                  <Icon icon={UserCheckIcon} />
                )}
                {m.checkin_do_checkin()}
              </Button>
            )}
            {registration.checked_in && !registration.strap_issued && (
              <Button
                variant="info"
                className="h-auto w-full whitespace-normal"
                onClick={onIssueStrap}
                disabled={!canUpdateEntrance || isUpdatingRegistration}
              >
                {isUpdatingRegistration ? (
                  <Spinner size="sm" role="status" aria-hidden="true" />
                ) : (
                  <Icon icon={ContactRoundIcon} />
                )}
                {m.admin_issue_strap()}
              </Button>
            )}
            {!canManageEntranceActions && (
              <div className="text-sm text-subtle">{m.checkin_actions_login_required()}</div>
            )}
          </div>
        )}
        {registration.order_items.length > 0 && (
          <div className="mt-4">
            <p className="font-semibold text-highlight mb-2">
              <Icon icon={ShoppingCartIcon} className="me-2" />
              {m.checkin_order_items()}
            </p>
            <PresentationList flush>
              {registration.order_items.map((item, idx) => (
                <PresentationListItem
                  key={`${item.product_id}-${idx}`}
                  className="flex justify-between items-center gap-4 flex-wrap"
                >
                  <span>
                    {item.name} <Badge variant="secondary">×{item.quantity}</Badge>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={item.delivered ? "success" : "secondary"}>
                      {m.admin_bottle_delivered()}: {item.delivered_quantity}/{item.quantity}
                    </Badge>
                    <Badge
                      variant={item.quantity - item.delivered_quantity > 0 ? "warning" : "success"}
                    >
                      {m.admin_bottle_not_delivered()}: {item.quantity - item.delivered_quantity}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAdjustOrderItem(item.product_id, -1)}
                        disabled={
                          !canUpdateEntrance ||
                          isUpdatingRegistration ||
                          item.delivered_quantity <= 0
                        }
                        title={m.admin_mark_not_delivered()}
                      >
                        <Icon icon={MinusIcon} />
                        <span className="sr-only">{m.admin_mark_not_delivered()}</span>
                      </Button>
                      <PublicInput
                        key={item.delivered_quantity}
                        aria-label={`${m.admin_bottle_delivered()} ${item.name}`}
                        className="w-20 text-center"
                        inputMode="numeric"
                        min={0}
                        max={item.quantity}
                        onBlur={(event) => {
                          const value = Number(event.currentTarget.value);
                          if (Number.isFinite(value)) {
                            const bounded = Math.max(0, Math.min(item.quantity, Math.trunc(value)));
                            event.currentTarget.value = String(bounded);
                            if (bounded !== item.delivered_quantity) {
                              onSetOrderItemQuantity(item.product_id, bounded);
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
                        disabled={!canUpdateEntrance || isUpdatingRegistration}
                      />
                      <Button
                        size="sm"
                        variant={item.delivered ? "success" : "outline-success"}
                        onClick={() => onAdjustOrderItem(item.product_id, 1)}
                        disabled={
                          !canUpdateEntrance ||
                          isUpdatingRegistration ||
                          item.delivered_quantity >= item.quantity
                        }
                        title={m.admin_mark_delivered()}
                      >
                        <Icon icon={PlusIcon} />
                        <span className="sr-only">{m.admin_mark_delivered()}</span>
                      </Button>
                    </div>
                  </div>
                </PresentationListItem>
              ))}
            </PresentationList>
            {!canManageEntranceActions && registration.checked_in && registration.strap_issued && (
              <div className="text-sm text-subtle mt-2">
                <Icon icon={InfoIcon} className="me-1" />
                {m.checkin_actions_login_required()}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

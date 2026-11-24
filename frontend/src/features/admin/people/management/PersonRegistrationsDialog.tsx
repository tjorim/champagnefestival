import { formatEuro, formatNumber } from "@/lib/format/numberUtils";
import { getLocale } from "@/paraglide/runtime";
import { formatDate } from "@/lib/format/dateUtils";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Button } from "@/components/ui/button";
import {
  CalendarCheckIcon,
  CircleCheckIcon,
  FileSpreadsheetIcon,
  NotebookTextIcon,
  UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
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
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { type PeopleManagementState } from "./usePeopleManagement";

interface PersonRegistrationsDialogProps {
  state: PeopleManagementState;
}

/** A person's bookings and payment summary. */
export function PersonRegistrationsDialog({ state }: PersonRegistrationsDialogProps) {
  const {
    closePersonRegistrations,
    personRegistrations,
    loadingPersonRegistrations,
    personRegistrationsError,
    personPaymentSummary,
    handleExportLedger,
    personPaymentTotals,
    exportingLedger,
    ledgerExportError,
    setShowLedgerModal,
    setLedgerPage,
    setLedgerSorting,
  } = state;
  const viewRegistrationsPerson = state.viewRegistrationsPerson;
  if (!viewRegistrationsPerson) return null;
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) closePersonRegistrations();
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle>
            <Icon icon={CalendarCheckIcon} className="me-2" />
            {m.admin_people_registrations_modal_title()} — {viewRegistrationsPerson.name}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          {loadingPersonRegistrations && (
            <div className="text-center py-6">
              <Spinner label={m.admin_loading()} size="sm" variant="warning" />
            </div>
          )}
          {!loadingPersonRegistrations && personRegistrationsError && (
            <Alert role="alert" aria-live="assertive" variant="danger" className="m-4">
              {m.admin_people_registrations_load_error()}
            </Alert>
          )}
          {!loadingPersonRegistrations &&
            !personRegistrationsError &&
            personRegistrations.length === 0 && (
              <AdminEmptyState>{m.admin_people_registrations_empty()}</AdminEmptyState>
            )}
          {!loadingPersonRegistrations &&
            !personRegistrationsError &&
            personRegistrations.length > 0 && (
              <div className="px-4 pt-4 text-sm text-subtle">
                <div>
                  {m.admin_people_total_paid({
                    amount: formatEuro(personPaymentTotals.grandTotal, getLocale()),
                  })}
                </div>
                <div>
                  {m.admin_people_total_outstanding({
                    amount: formatEuro(personPaymentTotals.outstandingTotal, getLocale()),
                  })}
                </div>
                {personPaymentSummary && (
                  <>
                    <div>
                      {m.admin_people_total_received({
                        amount: formatEuro(Number(personPaymentSummary.received), getLocale()),
                      })}
                    </div>
                    <div>
                      {m.admin_people_total_refunded({
                        amount: formatEuro(Number(personPaymentSummary.refunded), getLocale()),
                      })}
                    </div>
                  </>
                )}
                {personPaymentTotals.byEdition.length > 1 &&
                  personPaymentTotals.byEdition.map((edition) => (
                    <div key={edition.label} className="ms-2">
                      {edition.label}: {formatEuro(edition.totalPaid, getLocale())}
                    </div>
                  ))}
              </div>
            )}
          {!loadingPersonRegistrations &&
            !personRegistrationsError &&
            personRegistrations.length > 0 && (
              <PresentationList flush>
                {personRegistrations.map((r) => (
                  <PresentationListItem key={r.id} className="py-2">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-semibold text-sm">{r.event.title}</div>
                        <div className="text-subtle text-sm">
                          <Icon icon={UsersIcon} className="me-1" />
                          {formatNumber(r.guest_count, getLocale())}
                          <span className="ms-2">{formatEuro(r.amount_paid, getLocale())}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        <Badge
                          variant={
                            r.status === "confirmed"
                              ? "success"
                              : r.status === "cancelled"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {r.status === "confirmed"
                            ? m.admin_status_confirmed()
                            : r.status === "cancelled"
                              ? m.admin_status_cancelled()
                              : m.admin_status_pending()}
                        </Badge>
                        <Badge
                          variant={
                            r.payment_status === "paid"
                              ? "success"
                              : r.payment_status === "partial"
                                ? "warning"
                                : "secondary"
                          }
                        >
                          {r.payment_status === "paid"
                            ? m.admin_payment_paid()
                            : r.payment_status === "partial"
                              ? m.admin_payment_partial()
                              : m.admin_payment_unpaid()}
                        </Badge>
                        {r.checked_in && (
                          <Badge variant="success">
                            <Icon icon={CircleCheckIcon} className="me-1" />
                            {m.admin_checked_in()}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-subtle text-tiny">
                      {formatDate(r.created_at, getLocale())}
                    </div>
                  </PresentationListItem>
                ))}
              </PresentationList>
            )}
        </DialogBody>
        <DialogFooter className="flex-col items-stretch">
          {ledgerExportError && (
            <Alert role="alert" aria-live="assertive" variant="danger" className="py-2 mb-2">
              {ledgerExportError}
            </Alert>
          )}
          <div className="flex justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={personRegistrations.length === 0}
                onClick={() => {
                  setLedgerPage(1);
                  setLedgerSorting([]);
                  setShowLedgerModal(true);
                }}
                title={m.admin_payment_view_ledger()}
              >
                <Icon icon={NotebookTextIcon} />
                {m.admin_payment_view_ledger()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exportingLedger || personRegistrations.length === 0}
                onClick={() => void handleExportLedger()}
                title={m.admin_people_export_ledger()}
              >
                {exportingLedger ? <Spinner size="sm" /> : <Icon icon={FileSpreadsheetIcon} />}
                {m.admin_people_export_ledger()}
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={closePersonRegistrations}>
              {m.close()}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

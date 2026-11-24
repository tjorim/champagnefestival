import { formatNumber } from "@/lib/format/numberUtils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import type { Registration } from "@/types/registration";
import { formatDate } from "@/lib/format/dateUtils";
import {
  type RegistrationSelection,
  type RegistrationBulkActions,
} from "./useRegistrationSelection";

interface RegistrationBulkDialogProps {
  bulk: RegistrationBulkActions;
  selection: RegistrationSelection;
  registrationsById: Map<string, Registration>;
  pageRegistrations: Registration[];
}

/** Confirms a bulk confirm/cancel/mark-paid over the selected bookings and shows its progress. */
export function RegistrationBulkDialog({
  bulk,
  selection,
  registrationsById,
  pageRegistrations,
}: RegistrationBulkDialogProps) {
  const locale = getLocale();
  const { bulkAction, setBulkAction, bulkInProgress, bulkProgress, executeBulkAction } = bulk;
  const { selectedIds, selectionRecords } = selection;
  const selectedRecords = [...selectedIds]
    .map(
      (id) =>
        registrationsById.get(id) ??
        pageRegistrations.find((record) => record.id === id) ??
        selectionRecords.get(id),
    )
    .filter((record): record is Registration => record !== undefined);
  const selectedEvents = new Map<string, { title: string; count: number }>();
  for (const record of selectedRecords) {
    const previous = selectedEvents.get(record.event_id);
    selectedEvents.set(record.event_id, {
      title: `${record.event?.title ?? record.event_id}${record.event?.date ? ` · ${formatDate(record.event.date, locale)}` : ""}`,
      count: (previous?.count ?? 0) + 1,
    });
  }

  return (
    <Dialog
      open={bulkAction !== null}
      onOpenChange={(open) => {
        if (!open) setBulkAction(null);
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle>
            {bulkAction === "confirm" && m.admin_bulk_confirm()}
            {bulkAction === "cancel" && m.admin_bulk_cancel()}
            {bulkAction === "paid" && m.admin_bulk_mark_paid()}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {m.admin_bulk_confirm_action({ count: selectedIds.size })}
          <ul className="my-3 space-y-1">
            {[...selectedEvents].map(([id, event]) => (
              <li key={id}>
                {event.title}: {formatNumber(event.count, locale)}
              </li>
            ))}
          </ul>
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
              {m.admin_bulk_selected({ count: selectedIds.size })}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul
                tabIndex={0}
                aria-label={m.admin_bulk_selected({ count: selectedIds.size })}
                className="mt-2 max-h-48 overflow-y-auto space-y-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {selectedRecords.map((record) => (
                  <li key={record.id}>
                    {record.person.name} · {record.event?.title ?? record.event_id}
                    {record.event?.date ? ` · ${formatDate(record.event.date, locale)}` : ""} ·{" "}
                    {m.admin_guests_count()}: {formatNumber(record.guest_count, locale)}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
          {bulkProgress && (
            <div className="mt-2 text-subtle text-sm">
              {m.admin_bulk_progress({ done: bulkProgress.done, total: bulkProgress.total })}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setBulkAction(null)} disabled={bulkInProgress}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant={bulkAction === "cancel" ? "danger" : "default"}
            onClick={executeBulkAction}
            disabled={bulkInProgress}
          >
            {bulkInProgress && <Spinner size="sm" aria-hidden="true" />}
            {m.admin_action_confirm()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

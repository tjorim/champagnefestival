import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { m } from "@/paraglide/messages";
import {
  type RegistrationSelection,
  type RegistrationBulkActions,
} from "./useRegistrationSelection";

interface RegistrationBulkBarProps {
  selection: RegistrationSelection;
  bulk: RegistrationBulkActions;
  canExpandSelectionToAllMatching: boolean;
  pageRegistrationCount: number;
  total: number;
}

/** The bar above the table once registrations are selected: expand to all matching, bulk actions, clear. */
export function RegistrationBulkBar({
  selection,
  bulk,
  canExpandSelectionToAllMatching,
  pageRegistrationCount,
  total,
}: RegistrationBulkBarProps) {
  const {
    selectedIds,
    selectAllMatchingActive,
    isSelectingAllMatching,
    selectAllMatchingError,
    setSelectAllMatchingError,
    clearSelection,
  } = selection;
  const { setBulkAction, handleSelectAllMatching } = bulk;
  return (
    <div
      id="registration-bulk-actions"
      role="region"
      aria-label={m.admin_bulk_selected({ count: selectedIds.size })}
      tabIndex={-1}
      className="mt-2 pt-2 border-t border-subtle"
    >
      {canExpandSelectionToAllMatching && (
        <div className="flex items-center gap-2 flex-wrap text-sm text-subtle mb-2">
          <span>{m.admin_bulk_select_page_notice({ count: pageRegistrationCount })}</span>
          <Button
            size="sm"
            variant="link"
            className="p-0"
            onClick={() => void handleSelectAllMatching()}
            disabled={isSelectingAllMatching}
          >
            {isSelectingAllMatching && <Spinner size="sm" aria-hidden="true" />}
            {m.admin_bulk_select_all_matching({ total })}
          </Button>
        </div>
      )}
      {selectAllMatchingError && (
        <Alert
          role="alert"
          aria-live="assertive"
          variant="danger"
          className="py-1 mb-2"
          onClose={() => setSelectAllMatchingError(null)}
        >
          {selectAllMatchingError}
        </Alert>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span role="status" className="text-subtle text-sm">
          {selectAllMatchingActive
            ? m.admin_bulk_all_matching_selected({ total: selectedIds.size })
            : m.admin_bulk_selected({ count: selectedIds.size })}
        </span>
        <Button size="sm" variant="outline-success" onClick={() => setBulkAction("confirm")}>
          {m.admin_bulk_confirm()}
        </Button>
        <Button size="sm" variant="outline-danger" onClick={() => setBulkAction("cancel")}>
          {m.admin_bulk_cancel()}
        </Button>
        <Button size="sm" variant="outline-info" onClick={() => setBulkAction("paid")}>
          {m.admin_bulk_mark_paid()}
        </Button>
        <Button
          size="sm"
          variant="link"
          className="text-subtle ms-auto p-0"
          onClick={clearSelection}
        >
          {m.admin_bulk_clear()}
        </Button>
      </div>
    </div>
  );
}

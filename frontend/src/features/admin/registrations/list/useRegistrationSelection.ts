import { useCallback, useState } from "react";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Registration, RegistrationStatus } from "@/types/registration";
import { devError } from "@/lib/devLog";
import { BULK_ACTION_BATCH_SIZE } from "./registrationListConfig";

/** The selected registrations (page-scoped or "all matching") and the actions that clear them. */
export function useRegistrationSelection(setAttendanceFeedback: (feedback: string) => void) {
  const [selectionRecords, setSelectionRecords] = useState<Map<string, Registration>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // True only once the user has explicitly expanded a full-page selection to
  // "every registration matching these filters" (the Gmail-style banner
  // below) — purely a label/UX flag; `selectedIds` itself always holds the
  // real set being acted on.
  const [selectAllMatchingActive, setSelectAllMatchingActive] = useState(false);
  const [isSelectingAllMatching, setIsSelectingAllMatching] = useState(false);
  const [selectAllMatchingError, setSelectAllMatchingError] = useState<string | null>(null);

  // The set of matching registrations changes under any filter change, so a
  // held-over selection (page-scoped or "all matching") no longer means what
  // it did — clear it rather than silently acting on a stale set later.
  const clearSelection = useCallback(() => {
    setAttendanceFeedback("");
    setSelectionRecords(new Map());
    setSelectedIds(new Set());
    setSelectAllMatchingActive(false);
    setSelectAllMatchingError(null);
  }, [setAttendanceFeedback]);

  return {
    selectionRecords,
    setSelectionRecords,
    selectedIds,
    setSelectedIds,
    selectAllMatchingActive,
    setSelectAllMatchingActive,
    isSelectingAllMatching,
    setIsSelectingAllMatching,
    selectAllMatchingError,
    setSelectAllMatchingError,
    clearSelection,
  };
}

export type RegistrationSelection = ReturnType<typeof useRegistrationSelection>;

interface RegistrationBulkActionsOptions {
  selection: RegistrationSelection;
  fetchAllMatchingRegistrations: () => Promise<Registration[]>;
  onUpdateStatus: (id: string, status: RegistrationStatus) => Promise<void>;
  onRecordPayment: (id: string) => Promise<void>;
}

/** "Select all matching" and the confirm/cancel/mark-paid bulk actions over the selection. */
export function useRegistrationBulkActions({
  selection,
  fetchAllMatchingRegistrations,
  onUpdateStatus,
  onRecordPayment,
}: RegistrationBulkActionsOptions) {
  const {
    selectedIds,
    setSelectionRecords,
    setSelectedIds,
    setSelectAllMatchingActive,
    setIsSelectingAllMatching,
    setSelectAllMatchingError,
    clearSelection,
  } = selection;
  const [bulkAction, setBulkAction] = useState<"confirm" | "cancel" | "paid" | null>(null);
  const [bulkInProgress, setBulkInProgress] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Selecting a whole page whose filters match more than fits on it offers a
  // Gmail-style "select all N matching" expansion. `selectedIds` becomes the
  // real, materialized set of every matching id (bounded the same way as any
  // other full-set fetch) rather than a lazily-resolved scope, so everything
  // downstream (the confirm dialog's count, execution) works unchanged.
  const handleSelectAllMatching = useCallback(async () => {
    setIsSelectingAllMatching(true);
    setSelectAllMatchingError(null);
    try {
      const matching = await fetchAllMatchingRegistrations();
      setSelectionRecords(new Map(matching.map((record) => [record.id, record])));
      setSelectedIds(new Set(matching.map((r) => r.id)));
      setSelectAllMatchingActive(true);
    } catch (err) {
      devError("Failed to select all matching registrations", err);
      setSelectAllMatchingError(apiErrorMessage(err, m.admin_error_load_data()));
    } finally {
      setIsSelectingAllMatching(false);
    }
  }, [
    fetchAllMatchingRegistrations,
    setIsSelectingAllMatching,
    setSelectAllMatchingError,
    setSelectAllMatchingActive,
    setSelectedIds,
    setSelectionRecords,
  ]);

  const executeBulkAction = useCallback(async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkInProgress(true);
    setBulkError(null);
    const ids = [...selectedIds];
    setBulkProgress({ done: 0, total: ids.length });
    let failedCount = 0;
    // Bounded concurrency: a "select all matching" batch can be a few hundred
    // ids, and firing them all as simultaneous requests is unkind to both the
    // browser and the server compared to the handful a single page ever had.
    for (let start = 0; start < ids.length; start += BULK_ACTION_BATCH_SIZE) {
      const batch = ids.slice(start, start + BULK_ACTION_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((id) => {
          if (bulkAction === "confirm") return Promise.resolve(onUpdateStatus(id, "confirmed"));
          if (bulkAction === "cancel") return Promise.resolve(onUpdateStatus(id, "cancelled"));
          if (bulkAction === "paid") return Promise.resolve(onRecordPayment(id));
          return Promise.resolve();
        }),
      );
      failedCount += results.filter((r) => r.status === "rejected").length;
      setBulkProgress({ done: Math.min(start + batch.length, ids.length), total: ids.length });
    }
    setBulkInProgress(false);
    setBulkProgress(null);
    setBulkAction(null);
    if (failedCount > 0) {
      setBulkError(m.admin_bulk_operations_failed({ failed: failedCount, total: ids.length }));
    } else {
      clearSelection();
    }
  }, [bulkAction, onRecordPayment, onUpdateStatus, selectedIds, clearSelection]);

  return {
    bulkAction,
    setBulkAction,
    bulkInProgress,
    bulkProgress,
    bulkError,
    setBulkError,
    handleSelectAllMatching,
    executeBulkAction,
  };
}

export type RegistrationBulkActions = ReturnType<typeof useRegistrationBulkActions>;

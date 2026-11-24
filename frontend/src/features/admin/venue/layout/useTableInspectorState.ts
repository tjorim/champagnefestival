import { useState } from "react";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Registration } from "@/types/registration";
import type { TableAllocation } from "@/api-types";

/**
 * The table inspector's transient state: inline update errors and the booking-assignment form.
 * It lives in the editor (not the card) so it survives deselecting and reselecting a table.
 */
export function useTableInspectorState(
  onSaveAllocations: (registrationId: string, allocations: TableAllocation[]) => Promise<void>,
) {
  const [updateTableError, setUpdateTableError] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [allocationPending, setAllocationPending] = useState(false);
  const [bookingToAssign, setBookingToAssign] = useState("");
  const [guestsToAssign, setGuestsToAssign] = useState(1);

  const savePlanAllocations = async (
    registration: Registration,
    allocations: TableAllocation[],
  ) => {
    setAllocationError(null);
    setAllocationPending(true);
    try {
      await onSaveAllocations(registration.id, allocations);
    } catch (error) {
      setAllocationError(apiErrorMessage(error, m.admin_error_assign_table()));
    } finally {
      setAllocationPending(false);
    }
  };

  return {
    updateTableError,
    setUpdateTableError,
    allocationError,
    allocationPending,
    bookingToAssign,
    setBookingToAssign,
    guestsToAssign,
    setGuestsToAssign,
    savePlanAllocations,
  };
}

export type TableInspectorState = ReturnType<typeof useTableInspectorState>;

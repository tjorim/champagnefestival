import { orderAnswersBody } from "@/lib/editions/orderQuestions";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { apiErrorMessage, hasApiErrorCode } from "@/lib/api/apiErrors";
import type {
  OrderItemOut,
  PaymentTransactionCreate,
  RegistrationOut,
  RegistrationOutWithToken,
  TableAllocation,
} from "@/api-types";
import { toAmount } from "../shared/money";
import type { BookingUpdate, Registration, RegistrationStatus } from "@/types/registration";
import { useRegistrationAdminMutations } from "../registrations/useRegistrationAdminMutations";
import { fetchJsonOrThrowWithUnauthorized } from "@/lib/api/adminApi";
import { fetchRegistration } from "@/lib/api/adminFetch";
import { toLocalDateKey } from "@/lib/format/dateUtils";
import { devError } from "@/lib/devLog";

interface UseAdminRegistrationActionsOptions {
  authHeaders: () => Record<string, string>;
  queryClient: QueryClient;
  registrationsQueryKey: QueryKey;
  setDetailRegistration: Dispatch<SetStateAction<Registration | null>>;
  setRegistrationError: Dispatch<SetStateAction<string>>;
  /**
   * Asks the operator to confirm an over-capacity write, which is only known
   * to be needed after the first attempt comes back rejected. Supplied by the
   * rendering component (see `useConfirmDialog`) because a hook can't render
   * the dialog itself.
   */
  confirmOverCapacity: () => Promise<boolean>;
}

/** Matches the backend's table-capacity rejection (see `allocations_service.validate_allocations`). */
function isCapacityError(error: unknown): boolean {
  return hasApiErrorCode(error, "table_over_capacity");
}

export function bookingUpdatePayload(update: BookingUpdate, confirmOverCapacity = false) {
  return {
    guest_count: update.guestCount,
    ...(Object.keys(update.quantities).length
      ? {
          order_items: Object.entries(update.quantities)
            .filter(([, quantity]) => quantity > 0)
            .map(([product_id, quantity]) => ({ product_id, quantity })),
        }
      : {}),
    allocations: update.allocations.map((allocation) => ({
      table_id: allocation.table_id,
      guest_count: allocation.guest_count,
      exclusive: allocation.exclusive,
    })),
    notes: update.notes,
    ...(update.orderAnswers ? { order_answers: orderAnswersBody(update.orderAnswers) } : {}),
    status: update.status,
    confirm_over_capacity: confirmOverCapacity,
  };
}

export function useAdminRegistrationActions({
  authHeaders,
  queryClient,
  registrationsQueryKey,
  setDetailRegistration,
  setRegistrationError,
  confirmOverCapacity,
}: UseAdminRegistrationActionsOptions) {
  const { updateRegistrationMutation, updateEntranceMutation, createPaymentTransactionMutation } =
    useRegistrationAdminMutations({
      queryClient,
      authHeaders,
      registrationsQueryKey,
    });

  const handleUpdateStatus = useCallback(
    async (id: string, status: RegistrationStatus) => {
      try {
        const updated = await updateRegistrationMutation.mutateAsync({
          id,
          payload: { status },
          fallbackMessage: m.admin_error_update_registration(),
        });
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((registration) =>
                registration.id === id
                  ? { ...registration, status: updated.status, updatedAt: updated.updated_at }
                  : registration,
              )
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === id
            ? { ...prev, status: updated.status, updatedAt: updated.updated_at }
            : prev,
        );
      } catch (err) {
        devError("Failed to update registration status", err);
        setRegistrationError(apiErrorMessage(err, m.admin_error_update_registration()));
        throw err;
      }
    },
    [
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      updateRegistrationMutation,
    ],
  );

  const handleUpdateGuestCount = useCallback(
    async (id: string, guestCount: number) => {
      try {
        const updated = await updateRegistrationMutation.mutateAsync({
          id,
          payload: { guest_count: guestCount },
          fallbackMessage: m.admin_error_update_registration(),
        });
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev?.map((registration) => (registration.id === id ? updated : registration)),
        );
        setDetailRegistration((prev) => (prev?.id === id ? updated : prev));
      } catch (err) {
        if (isCapacityError(err) && (await confirmOverCapacity())) {
          const updated = await updateRegistrationMutation.mutateAsync({
            id,
            payload: { guest_count: guestCount, confirm_over_capacity: true },
            fallbackMessage: m.admin_error_update_registration(),
          });
          queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
            prev?.map((registration) => (registration.id === id ? updated : registration)),
          );
          setDetailRegistration((prev) => (prev?.id === id ? updated : prev));
          return;
        }
        setRegistrationError(apiErrorMessage(err, m.admin_error_update_registration()));
        throw err;
      }
    },
    [
      confirmOverCapacity,
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      updateRegistrationMutation,
    ],
  );

  const handleAddTransaction = useCallback(
    async (registrationId: string, payload: PaymentTransactionCreate) => {
      let transaction;
      try {
        transaction = await createPaymentTransactionMutation.mutateAsync({
          registrationId,
          payload,
          fallbackMessage: m.admin_error_record_payment(),
        });
      } catch (err) {
        devError("Failed to record payment transaction", err);
        setRegistrationError(apiErrorMessage(err, m.admin_error_record_payment()));
        throw err;
      }

      // The transaction is recorded at this point — a failure below is a
      // refresh problem, not a payment problem, and must not surface as one:
      // the caller clears its form and stops offering a retry only on a
      // clean return, and a retry after a thrown error reuses a fresh
      // idempotency key, which would record this same payment a second time.
      try {
        const data = await fetchJsonOrThrowWithUnauthorized<RegistrationOutWithToken>(
          `/api/registrations/${registrationId}`,
          { headers: authHeaders() },
          m.admin_error_load_data(),
        );
        const updated = data;
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev?.map((registration) =>
            registration.id === registrationId ? updated : registration,
          ),
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        devError("Payment recorded, but failed to refresh the registration", err);
        setRegistrationError(m.admin_error_load_data());
      }
      return transaction;
    },
    [
      authHeaders,
      createPaymentTransactionMutation,
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
    ],
  );

  const handleRecordPayment = useCallback(
    async (id: string) => {
      const registration =
        queryClient.getQueryData<Registration[]>(registrationsQueryKey)?.find((r) => r.id === id) ??
        (await fetchRegistration(id, authHeaders));
      const outstanding = Math.max(
        0,
        toAmount(registration?.amount_due) - toAmount(registration?.amount_paid),
      );
      if (outstanding <= 0) return;
      await handleAddTransaction(id, {
        amount: outstanding,
        effective_date: toLocalDateKey(new Date()),
        idempotency_key: crypto.randomUUID(),
      });
    },
    [handleAddTransaction, queryClient, registrationsQueryKey, authHeaders],
  );

  const handleSaveAllocations = useCallback(
    async (registrationId: string, allocations: TableAllocation[]) => {
      const save = (confirm = false) =>
        updateRegistrationMutation.mutateAsync({
          id: registrationId,
          payload: {
            allocations: allocations.map((a) => ({
              table_id: a.table_id,
              guest_count: a.guest_count,
              exclusive: a.exclusive,
            })),
            confirm_over_capacity: confirm,
          },
          fallbackMessage: m.admin_error_assign_table(),
        });
      try {
        let response: RegistrationOut;
        try {
          response = await save();
        } catch (error) {
          if (!isCapacityError(error) || !(await confirmOverCapacity())) throw error;
          response = await save(true);
        }
        const updated = response;
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev?.map((r) => (r.id === registrationId ? updated : r)),
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (error) {
        setRegistrationError(apiErrorMessage(error, m.admin_error_assign_table()));
        throw error;
      }
    },
    [
      confirmOverCapacity,
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      updateRegistrationMutation,
    ],
  );

  const handleSaveBooking = useCallback(
    async (registrationId: string, update: BookingUpdate) => {
      const save = (confirm = false) =>
        updateRegistrationMutation.mutateAsync({
          id: registrationId,
          payload: bookingUpdatePayload(update, confirm),
          fallbackMessage: m.admin_error_update_registration(),
        });
      try {
        let response: RegistrationOut;
        try {
          response = await save();
        } catch (error) {
          if (!isCapacityError(error) || !(await confirmOverCapacity())) throw error;
          response = await save(true);
        }
        const updated = response;
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (previous) =>
          previous?.map((item) => (item.id === registrationId ? updated : item)),
        );
        setDetailRegistration((previous) => (previous?.id === registrationId ? updated : previous));
      } catch (error) {
        setRegistrationError(apiErrorMessage(error, m.admin_error_update_registration()));
        throw error;
      }
    },
    [
      confirmOverCapacity,
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      updateRegistrationMutation,
    ],
  );

  const handleAssignTable = useCallback(
    async (registrationId: string, tableId: string | undefined) => {
      const registration =
        queryClient
          .getQueryData<Registration[]>(registrationsQueryKey)
          ?.find((r) => r.id === registrationId) ??
        (await fetchRegistration(registrationId, authHeaders));
      if (!registration || (registration.allocations?.length ?? 0) > 1) return;
      try {
        await handleSaveAllocations(
          registrationId,
          tableId
            ? [
                {
                  table_id: tableId,
                  guest_count:
                    registration.allocations?.[0]?.guest_count ??
                    ((registration.booked_table_quantity ?? 0) > 0 ? 0 : registration.guest_count),
                  exclusive: (registration.booked_table_quantity ?? 0) > 0,
                },
              ]
            : [],
        );
      } catch {
        /* Shared action feedback already displays the error. */
      }
    },
    [queryClient, registrationsQueryKey, handleSaveAllocations, authHeaders],
  );

  const handleAddRegistration = useCallback(
    (registration: Registration) => {
      // Never seed an unloaded list with a single row: that would present a
      // one-booking list as loaded (and repopulate the collection after a
      // sign-out reset). The initial fetch returns the new booking itself.
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev && registration.event?.edition_id === registrationsQueryKey[3]
          ? [registration, ...prev.filter((row) => row.id !== registration.id)]
          : prev,
      );
    },
    [queryClient, registrationsQueryKey],
  );

  const handleViewDetail = useCallback(
    async (registration: Registration) => {
      try {
        const data = await fetchJsonOrThrowWithUnauthorized<RegistrationOutWithToken>(
          `/api/registrations/${registration.id}`,
          { headers: authHeaders() },
          m.admin_error_load_data(),
        );
        setDetailRegistration(data);
      } catch (err) {
        devError("Failed to fetch registration detail, falling back to list data", err);
        setDetailRegistration(registration);
      }
    },
    [authHeaders, setDetailRegistration],
  );

  const handleToggleDelivered = useCallback(
    async (registrationId: string, updatedOrders: OrderItemOut[]) => {
      try {
        const updated = await updateEntranceMutation.mutateAsync({
          id: registrationId,
          payload: {
            order_items: updatedOrders.map((order) => ({
              product_id: order.product_id,
              name: order.name,
              quantity: order.quantity,
              delivered_quantity: order.delivered_quantity,
              price: order.price,
              category: order.category,
              delivered: order.delivered,
            })),
          },
          fallbackMessage: m.admin_error_bottle_delivery(),
        });
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((registration) =>
                registration.id === registrationId ? updated : registration,
              )
            : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        devError("Failed to update bottle delivery status", err);
        setRegistrationError(apiErrorMessage(err, m.admin_error_bottle_delivery()));
      }
    },
    [
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      updateEntranceMutation,
    ],
  );

  const handleCheckIn = useCallback(
    async (registrationId: string, checkedIn = true) => {
      try {
        const updated = await updateEntranceMutation.mutateAsync({
          id: registrationId,
          payload: { checked_in: checkedIn },
          fallbackMessage: checkedIn ? m.admin_error_check_in() : m.admin_error_undo_check_in(),
        });
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((registration) =>
                registration.id === registrationId ? updated : registration,
              )
            : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
        return true;
      } catch (err) {
        devError("Failed to update guest attendance", err);
        setRegistrationError(
          apiErrorMessage(
            err,
            checkedIn ? m.admin_error_check_in() : m.admin_error_undo_check_in(),
          ),
        );
        return false;
      }
    },
    [
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      updateEntranceMutation,
    ],
  );

  const handleIssueStrap = useCallback(
    async (registrationId: string) => {
      try {
        const updated = await updateEntranceMutation.mutateAsync({
          id: registrationId,
          payload: { strap_issued: true },
          fallbackMessage: m.admin_error_issue_strap(),
        });
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((registration) =>
                registration.id === registrationId ? updated : registration,
              )
            : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        devError("Failed to issue strap", err);
        setRegistrationError(apiErrorMessage(err, m.admin_error_issue_strap()));
      }
    },
    [
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      updateEntranceMutation,
    ],
  );

  return {
    handleAddRegistration,
    handleAddTransaction,
    handleAssignTable,
    handleSaveAllocations,
    handleSaveBooking,
    handleCheckIn,
    handleIssueStrap,
    handleToggleDelivered,
    handleRecordPayment,
    handleUpdateGuestCount,
    handleUpdateStatus,
    handleViewDetail,
  };
}

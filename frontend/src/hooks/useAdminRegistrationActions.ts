import { useCallback, type Dispatch, type SetStateAction } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import type {
  TableAllocation,
  BookingUpdate,
  OrderItem,
  PaymentStatus,
  Registration,
  RegistrationStatus,
} from "@/types/registration";
import { apiToRegistration } from "@/types/registrationMapper";
import { useRegistrationAdminMutations } from "@/hooks/useRegistrationAdminMutations";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { devError } from "@/utils/devLog";

interface UseAdminRegistrationActionsOptions {
  authHeaders: () => Record<string, string>;
  queryClient: QueryClient;
  registrationsQueryKey: QueryKey;
  tablesQueryKey: QueryKey;
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
function isCapacityError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("remaining seats");
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
      table_id: allocation.tableId,
      guest_count: allocation.guestCount,
      exclusive: allocation.exclusive,
    })),
    amount_paid: update.amountPaid,
    ...(update.paymentReason !== undefined ? { payment_reason: update.paymentReason } : {}),
    ...(update.paymentTransactionDate !== undefined
      ? { payment_transaction_date: update.paymentTransactionDate }
      : {}),
    notes: update.notes,
    status: update.status,
    confirm_over_capacity: confirmOverCapacity,
  };
}

export function useAdminRegistrationActions({
  authHeaders,
  queryClient,
  registrationsQueryKey,
  tablesQueryKey,
  setDetailRegistration,
  setRegistrationError,
  confirmOverCapacity,
}: UseAdminRegistrationActionsOptions) {
  const { updateRegistrationMutation } = useRegistrationAdminMutations({
    queryClient,
    authHeaders,
    registrationsQueryKey,
    tablesQueryKey,
  });

  const handleUpdateStatus = useCallback(
    async (id: string, status: RegistrationStatus) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id,
            payload: { status },
            fallbackMessage: m.admin_error_update_registration(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((registration) =>
                registration.id === id
                  ? { ...registration, status: updated.status, updatedAt: updated.updatedAt }
                  : registration,
              )
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === id
            ? { ...prev, status: updated.status, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        devError("Failed to update registration status", err);
        setRegistrationError(
          err instanceof Error ? err.message : m.admin_error_update_registration(),
        );
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
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id,
            payload: { guest_count: guestCount },
            fallbackMessage: m.admin_error_update_registration(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev?.map((registration) => (registration.id === id ? updated : registration)),
        );
        setDetailRegistration((prev) => (prev?.id === id ? updated : prev));
      } catch (err) {
        if (isCapacityError(err) && (await confirmOverCapacity())) {
          const updated = apiToRegistration(
            await updateRegistrationMutation.mutateAsync({
              id,
              payload: { guest_count: guestCount, confirm_over_capacity: true },
              fallbackMessage: m.admin_error_update_registration(),
            }),
          );
          queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
            prev?.map((registration) => (registration.id === id ? updated : registration)),
          );
          setDetailRegistration((prev) => (prev?.id === id ? updated : prev));
          return;
        }
        setRegistrationError(
          err instanceof Error ? err.message : m.admin_error_update_registration(),
        );
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

  const handleUpdatePayment = useCallback(
    async (id: string, paymentStatus: PaymentStatus) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id,
            payload: { payment_status: paymentStatus },
            fallbackMessage: m.admin_error_update_payment(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((registration) =>
                registration.id === id
                  ? {
                      ...registration,
                      paymentStatus: updated.paymentStatus,
                      updatedAt: updated.updatedAt,
                    }
                  : registration,
              )
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === id
            ? { ...prev, paymentStatus: updated.paymentStatus, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        devError("Failed to update payment status", err);
        setRegistrationError(err instanceof Error ? err.message : m.admin_error_update_payment());
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

  const handleSaveAllocations = useCallback(
    async (registrationId: string, allocations: TableAllocation[]) => {
      const save = (confirm = false) =>
        updateRegistrationMutation.mutateAsync({
          id: registrationId,
          payload: {
            allocations: allocations.map((a) => ({
              table_id: a.tableId,
              guest_count: a.guestCount,
              exclusive: a.exclusive,
            })),
            confirm_over_capacity: confirm,
          },
          fallbackMessage: m.admin_error_assign_table(),
        });
      try {
        let response: Record<string, unknown>;
        try {
          response = await save();
        } catch (error) {
          if (!isCapacityError(error) || !(await confirmOverCapacity())) throw error;
          response = await save(true);
        }
        const updated = apiToRegistration(response);
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev?.map((r) => (r.id === registrationId ? updated : r)),
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
        await queryClient.invalidateQueries({ queryKey: tablesQueryKey });
      } catch (error) {
        setRegistrationError(error instanceof Error ? error.message : m.admin_error_assign_table());
        throw error;
      }
    },
    [
      confirmOverCapacity,
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      tablesQueryKey,
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
        let response: Record<string, unknown>;
        try {
          response = await save();
        } catch (error) {
          if (!isCapacityError(error) || !(await confirmOverCapacity())) throw error;
          response = await save(true);
        }
        const updated = apiToRegistration(response);
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (previous) =>
          previous?.map((item) => (item.id === registrationId ? updated : item)),
        );
        setDetailRegistration((previous) => (previous?.id === registrationId ? updated : previous));
        await queryClient.invalidateQueries({ queryKey: tablesQueryKey });
      } catch (error) {
        setRegistrationError(
          error instanceof Error ? error.message : m.admin_error_update_registration(),
        );
        throw error;
      }
    },
    [
      confirmOverCapacity,
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      tablesQueryKey,
      updateRegistrationMutation,
    ],
  );

  const handleAssignTable = useCallback(
    async (registrationId: string, tableId: string | undefined) => {
      const registration = queryClient
        .getQueryData<Registration[]>(registrationsQueryKey)
        ?.find((r) => r.id === registrationId);
      if (!registration || (registration.allocations?.length ?? 0) > 1) return;
      try {
        await handleSaveAllocations(
          registrationId,
          tableId
            ? [
                {
                  tableId,
                  guestCount:
                    registration.allocations?.[0]?.guestCount ??
                    ((registration.bookedTableQuantity ?? 0) > 0 ? 0 : registration.guestCount),
                  exclusive: (registration.bookedTableQuantity ?? 0) > 0,
                },
              ]
            : [],
        );
      } catch {
        /* Shared action feedback already displays the error. */
      }
    },
    [queryClient, registrationsQueryKey, handleSaveAllocations],
  );

  const handleAddRegistration = useCallback(
    (registration: Registration) => {
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev ? [registration, ...prev] : [registration],
      );
    },
    [queryClient, registrationsQueryKey],
  );

  const handleViewDetail = useCallback(
    async (registration: Registration) => {
      try {
        const data = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
          `/api/registrations/${registration.id}`,
          { headers: authHeaders() },
          m.admin_error_load_data(),
        );
        setDetailRegistration(apiToRegistration(data));
      } catch (err) {
        devError("Failed to fetch registration detail, falling back to list data", err);
        setDetailRegistration(registration);
      }
    },
    [authHeaders, setDetailRegistration],
  );

  const handleToggleDelivered = useCallback(
    async (registrationId: string, updatedOrders: OrderItem[]) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: {
              order_items: updatedOrders.map((order) => ({
                product_id: order.productId,
                name: order.name,
                quantity: order.quantity,
                delivered_quantity: order.deliveredQuantity,
                price: order.price,
                category: order.category,
                delivered: order.delivered,
              })),
            },
            fallbackMessage: m.admin_error_bottle_delivery(),
          }),
        );
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
        setRegistrationError(err instanceof Error ? err.message : m.admin_error_bottle_delivery());
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

  const handleCheckIn = useCallback(
    async (registrationId: string) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { checked_in: true },
            fallbackMessage: m.admin_error_check_in(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((registration) =>
                registration.id === registrationId ? updated : registration,
              )
            : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        devError("Failed to check in guest", err);
        setRegistrationError(err instanceof Error ? err.message : m.admin_error_check_in());
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

  const handleIssueStrap = useCallback(
    async (registrationId: string) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { strap_issued: true },
            fallbackMessage: m.admin_error_issue_strap(),
          }),
        );
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
        setRegistrationError(err instanceof Error ? err.message : m.admin_error_issue_strap());
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

  return {
    handleAddRegistration,
    handleAssignTable,
    handleSaveAllocations,
    handleSaveBooking,
    handleCheckIn,
    handleIssueStrap,
    handleToggleDelivered,
    handleUpdatePayment,
    handleUpdateGuestCount,
    handleUpdateStatus,
    handleViewDetail,
  };
}

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import type {
  OrderItem,
  PaymentStatus,
  Registration,
  RegistrationStatus,
} from "@/types/registration";
import { apiToRegistration } from "@/types/registrationMapper";
import type { FloorTable } from "@/types/admin";
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
}

export function useAdminRegistrationActions({
  authHeaders,
  queryClient,
  registrationsQueryKey,
  tablesQueryKey,
  setDetailRegistration,
  setRegistrationError,
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
        setRegistrationError(err instanceof Error ? err.message : m.admin_error_update_registration());
        throw err;
      }
    },
    [queryClient, registrationsQueryKey, setDetailRegistration, setRegistrationError, updateRegistrationMutation],
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
    [queryClient, registrationsQueryKey, setDetailRegistration, setRegistrationError, updateRegistrationMutation],
  );

  const handleAssignTable = useCallback(
    async (registrationId: string, tableId: string | undefined) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { table_id: tableId ?? null },
            fallbackMessage: m.admin_error_assign_table(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((registration) =>
                registration.id === registrationId
                  ? { ...registration, tableId: updated.tableId, updatedAt: updated.updatedAt }
                  : registration,
              )
            : prev,
        );
        queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
          prev
            ? prev.map((table) => {
                const wasAssigned = table.registrationIds.includes(registrationId);
                const shouldBeAssigned = table.id === updated.tableId;
                if (wasAssigned && !shouldBeAssigned) {
                  return {
                    ...table,
                    registrationIds: table.registrationIds.filter((id) => id !== registrationId),
                  };
                }
                if (!wasAssigned && shouldBeAssigned) {
                  return { ...table, registrationIds: [...table.registrationIds, registrationId] };
                }
                return table;
              })
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === registrationId
            ? { ...prev, tableId: updated.tableId, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        devError("Failed to assign table", err);
        setRegistrationError(err instanceof Error ? err.message : m.admin_error_assign_table());
      }
    },
    [
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      tablesQueryKey,
      updateRegistrationMutation,
    ],
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
              pre_orders: updatedOrders.map((order) => ({
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
    [queryClient, registrationsQueryKey, setDetailRegistration, setRegistrationError, updateRegistrationMutation],
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
    [queryClient, registrationsQueryKey, setDetailRegistration, setRegistrationError, updateRegistrationMutation],
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
    [queryClient, registrationsQueryKey, setDetailRegistration, setRegistrationError, updateRegistrationMutation],
  );

  return {
    handleAddRegistration,
    handleAssignTable,
    handleCheckIn,
    handleIssueStrap,
    handleToggleDelivered,
    handleUpdatePayment,
    handleUpdateStatus,
    handleViewDetail,
  };
}

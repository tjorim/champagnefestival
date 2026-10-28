import { useMutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "@/utils/apiErrors";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { invalidateAdmin } from "@/utils/queryInvalidation";
import { queryKeys } from "@/utils/queryKeys";

interface UseRegistrationAdminMutationsOptions {
  queryClient: QueryClient;
  authHeaders: () => Record<string, string>;
  registrationsQueryKey: QueryKey;
}

export function useRegistrationAdminMutations({
  queryClient,
  authHeaders,
}: UseRegistrationAdminMutationsOptions) {
  const updateRegistration = ({
    id,
    payload,
    fallbackMessage,
  }: {
    id: string;
    payload: Record<string, unknown>;
    fallbackMessage: string;
  }) =>
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
      `/api/registrations/${id}`,
      { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) },
      fallbackMessage,
    );
  const invalidateRegistrations = () => {
    void invalidateAdmin(queryClient, [
      queryKeys.admin.registrations,
      queryKeys.admin.editionStats,
    ]);
  };
  const updateRegistrationMutation = useMutation({
    mutationFn: updateRegistration,
    onSettled: invalidateRegistrations,
    retry: false,
  });
  // Entrance decisions must fail live, never wait in an offline mutation queue.
  const updateEntranceMutation = useMutation({
    mutationFn: (variables: Parameters<typeof updateRegistration>[0]) => {
      if (!navigator.onLine)
        throw new ApiError("Entrance writes require a live connection.", { status: 0 });
      return updateRegistration(variables);
    },
    networkMode: "always",
    onSettled: invalidateRegistrations,
    retry: false,
  });

  const createPaymentTransactionMutation = useMutation({
    mutationFn: ({
      registrationId,
      payload,
      fallbackMessage,
    }: {
      registrationId: string;
      payload: Record<string, unknown>;
      fallbackMessage: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/registrations/${registrationId}/transactions`,
        { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) },
        fallbackMessage,
      ),
    onSettled: (_data, _error, variables) => {
      void invalidateAdmin(queryClient, [
        queryKeys.admin.registrations,
        queryKeys.admin.editionStats,
        queryKeys.admin.paymentTransactions(variables.registrationId),
        // Prefix matches: refreshes every person's payment-summary/
        // registrations view and every edition/person ledger drill-down,
        // since this mutation doesn't know which person's totals changed
        // without an extra registration lookup.
        ["admin", "people"],
        ["admin", "registrations", "transactions"],
      ]);
    },
    // A failed submission must surface the error so the caller can decide
    // whether to retry with the same idempotencyKey — never retried silently.
    retry: false,
  });

  return { updateRegistrationMutation, updateEntranceMutation, createPaymentTransactionMutation };
}

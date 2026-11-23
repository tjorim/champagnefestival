import { useMutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { PaymentTransactionCreate, PaymentTransactionOut, RegistrationOut } from "@/api-types";
import { ApiError } from "@/lib/api/apiErrors";
import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import { invalidateAdmin } from "@/lib/query/queryInvalidation";
import { queryKeys } from "@/lib/query/queryKeys";

interface UseRegistrationAdminMutationsOptions {
  queryClient: QueryClient;

  registrationsQueryKey: QueryKey;
}

export function useRegistrationAdminMutations({
  queryClient,
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
    fetchJsonOrThrow<RegistrationOut>(
      `/api/registrations/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
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
      payload: PaymentTransactionCreate;
      fallbackMessage: string;
    }) =>
      fetchJsonOrThrow<PaymentTransactionOut>(
        `/api/registrations/${registrationId}/transactions`,
        { method: "POST", body: JSON.stringify(payload) },
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

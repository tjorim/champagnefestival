import { useMutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { invalidateAdmin } from "@/utils/queryInvalidation";
import { queryKeys } from "@/utils/queryKeys";

interface UseRegistrationAdminMutationsOptions {
  queryClient: QueryClient;
  authHeaders: () => Record<string, string>;
  registrationsQueryKey: QueryKey;
  tablesQueryKey: QueryKey;
}

export function useRegistrationAdminMutations({
  queryClient,
  authHeaders,
  registrationsQueryKey,
  tablesQueryKey,
}: UseRegistrationAdminMutationsOptions) {
  const updateRegistrationMutation = useMutation({
    mutationFn: ({
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
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [registrationsQueryKey, tablesQueryKey]);
    },
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
        registrationsQueryKey,
        queryKeys.admin.paymentTransactions(variables.registrationId),
      ]);
    },
    // A failed submission must surface the error so the caller can decide
    // whether to retry with the same idempotencyKey — never retried silently.
    retry: false,
  });

  return { updateRegistrationMutation, createPaymentTransactionMutation };
}

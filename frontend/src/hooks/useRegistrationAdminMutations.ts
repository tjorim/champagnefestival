import { useMutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { invalidateAdmin } from "@/utils/queryInvalidation";

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

  return { updateRegistrationMutation };
}

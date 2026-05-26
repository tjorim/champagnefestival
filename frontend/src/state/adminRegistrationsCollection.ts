import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/utils/queryKeys";
import { fetchRegistrations } from "@/utils/adminFetch";

interface CreateAdminRegistrationsCollectionOptions {
  queryClient: QueryClient;
  authHeaders: () => Record<string, string>;
  enabled: boolean;
}

export function createAdminRegistrationsCollection({
  queryClient,
  authHeaders,
  enabled,
}: CreateAdminRegistrationsCollectionOptions) {
  return createCollection(
    queryCollectionOptions({
      queryKey: queryKeys.admin.registrations,
      queryFn: () => fetchRegistrations(authHeaders),
      queryClient,
      enabled,
      staleTime: 60 * 1000,
      retry: false,
      getKey: (registration) => registration.id,
    }),
  );
}

export type AdminRegistrationsCollection = ReturnType<typeof createAdminRegistrationsCollection>;

export function resetAdminRegistrationsCollection(
  collection: AdminRegistrationsCollection,
): void {
  if (collection.size === 0) return;
  collection.utils.writeBatch(() => {
    for (const key of collection.keys()) {
      collection.utils.writeDelete(key);
    }
  });
}

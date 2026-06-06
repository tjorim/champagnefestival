import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import type { LiveEnvelope } from "@/utils/liveStream";
import { queryKeys } from "@/utils/queryKeys";
import { fetchRegistration, fetchRegistrations } from "@/utils/adminFetch";

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

type AuthHeadersProvider = () => Record<string, string>;

const activeAdminRegistrationsCollections = new Set<AdminRegistrationsCollection>();
const latestRegistrationEventTimestamps = new Map<string, string>();

export function registerAdminRegistrationsCollection(
  collection: AdminRegistrationsCollection,
): () => void {
  activeAdminRegistrationsCollections.add(collection);
  return () => {
    activeAdminRegistrationsCollections.delete(collection);
  };
}

export function resetAdminRegistrationsCollection(collection: AdminRegistrationsCollection): void {
  if (collection.size === 0) return;
  collection.utils.writeBatch(() => {
    for (const key of collection.keys()) {
      collection.utils.writeDelete(key);
      latestRegistrationEventTimestamps.delete(key);
    }
  });
}

function hasAdminRegistrationsKey(envelope: LiveEnvelope): boolean {
  return envelope.keys.some(
    (key) =>
      key.length === queryKeys.admin.registrations.length &&
      key.every((part, index) => part === queryKeys.admin.registrations[index]),
  );
}

function isRegistrationCollectionLiveEvent(envelope: LiveEnvelope): boolean {
  if (!hasAdminRegistrationsKey(envelope)) return false;

  return ["check_in", "delivery", "order", "registration", "seating"].includes(envelope.topic);
}

export function canPatchAdminRegistrationLiveEvent(envelope: LiveEnvelope): boolean {
  return (
    activeAdminRegistrationsCollections.size > 0 &&
    isRegistrationCollectionLiveEvent(envelope) &&
    typeof envelope.scope.registration_id === "string" &&
    envelope.scope.registration_id.length > 0
  );
}

export async function patchAdminRegistrationLiveEvent(
  envelope: LiveEnvelope,
  authHeaders: AuthHeadersProvider,
): Promise<void> {
  if (!canPatchAdminRegistrationLiveEvent(envelope)) {
    throw new Error("Live event cannot be applied incrementally.");
  }

  const registrationId = envelope.scope.registration_id!;
  const eventTs = envelope.ts;

  const lastTs = latestRegistrationEventTimestamps.get(registrationId);
  if (lastTs && eventTs < lastTs) {
    return;
  }
  latestRegistrationEventTimestamps.set(registrationId, eventTs);

  if (envelope.topic === "registration" && envelope.action === "deleted") {
    for (const collection of activeAdminRegistrationsCollections) {
      collection.utils.writeDelete(registrationId);
    }
    return;
  }

  const registration = await fetchRegistration(registrationId, authHeaders);

  const currentLastTs = latestRegistrationEventTimestamps.get(registrationId);
  if (currentLastTs && eventTs < currentLastTs) {
    return;
  }

  for (const collection of activeAdminRegistrationsCollections) {
    collection.utils.writeUpsert(registration);
  }
}

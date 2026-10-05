import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import { createEpochFence } from "@/state/epochFence";
import type { LiveEnvelope } from "@/utils/liveStream";
import { queryKeys } from "@/utils/queryKeys";
import { fetchAllRegistrations, fetchRegistration } from "@/utils/adminFetch";

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
      queryFn: () => fetchAllRegistrations(authHeaders),
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
const latestRegistrationEventTimestamps = new Map<string, number>();

/**
 * Advanced whenever the set of active collections changes or a collection is
 * reset (sign-out), so a live-event fetch that resolves afterwards is dropped
 * instead of written into the replacement state; see `epochFence.ts`.
 */
const registrationsFence = createEpochFence();

export function registerAdminRegistrationsCollection(
  collection: AdminRegistrationsCollection,
): () => void {
  registrationsFence.advance();
  activeAdminRegistrationsCollections.add(collection);
  return () => {
    registrationsFence.advance();
    activeAdminRegistrationsCollections.delete(collection);
    if (activeAdminRegistrationsCollections.size === 0) {
      latestRegistrationEventTimestamps.clear();
    }
  };
}

export async function resetAdminRegistrationsCollection(
  collection: AdminRegistrationsCollection,
): Promise<void> {
  registrationsFence.advance();
  latestRegistrationEventTimestamps.clear();
  if (collection.size === 0) return;
  await collection.utils.writeBatch(() => {
    for (const key of collection.keys()) {
      void collection.utils.writeDelete(key);
      latestRegistrationEventTimestamps.delete(key);
    }
  });
}

/**
 * Deleting a key the collection no longer holds throws, and a row can already
 * be gone (a reset or an earlier event got there first), so only delete what
 * is still present.
 */
async function deleteIfPresent(
  collection: AdminRegistrationsCollection,
  key: string,
): Promise<void> {
  if (collection.has(key)) await collection.utils.writeDelete(key);
}

/**
 * Applies a write to every active collection and resolves once all of them have
 * applied it. Waits for every write to settle (so none is left running behind a
 * rejection) and then rejects with the first failure, including a synchronous
 * throw from a collection whose sync has not started.
 */
async function writeToActiveCollections(
  write: (collection: AdminRegistrationsCollection) => Promise<void>,
): Promise<void> {
  const results = await Promise.allSettled(
    Array.from(activeAdminRegistrationsCollections, async (collection) => write(collection)),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
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
    typeof envelope.scope?.registration_id === "string" &&
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
  const isCurrent = registrationsFence.capture();
  const eventTime = Date.parse(envelope.ts);
  if (isNaN(eventTime)) return;

  const lastTime = latestRegistrationEventTimestamps.get(registrationId);
  if (lastTime !== undefined && eventTime < lastTime) {
    return;
  }
  latestRegistrationEventTimestamps.set(registrationId, eventTime);

  if (envelope.topic === "registration" && envelope.action === "deleted") {
    await writeToActiveCollections((collection) => deleteIfPresent(collection, registrationId));
    return;
  }

  const registration = await fetchRegistration(registrationId, authHeaders);

  // Sign-out or a collection swap happened while the booking was in flight.
  if (!isCurrent()) return;

  const currentLastTime = latestRegistrationEventTimestamps.get(registrationId);
  if (currentLastTime !== undefined && eventTime < currentLastTime) {
    return;
  }

  await writeToActiveCollections((collection) => collection.utils.writeUpsert(registration));
}

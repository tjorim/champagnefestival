import type { QueryClient } from "@tanstack/react-query";
import {
  createAdminCollection,
  createAdminCollectionLifecycle,
  type AdminCollectionSyncMode,
} from "@/state/adminCollectionFactory";
import type { LiveEnvelope } from "@/utils/liveStream";
import { queryKeys } from "@/utils/queryKeys";
import { fetchAllRegistrations, fetchRegistration } from "@/utils/adminFetch";
import type { Registration } from "@/types/registration";

interface CreateAdminRegistrationsCollectionOptions {
  queryClient: QueryClient;
  authHeaders: () => Record<string, string>;
  enabled: boolean;
  syncMode?: AdminCollectionSyncMode;
}

export function createAdminRegistrationsCollection({
  queryClient,
  authHeaders,
  enabled,
  syncMode,
}: CreateAdminRegistrationsCollectionOptions) {
  return createAdminCollection<Registration>({
    queryKey: queryKeys.admin.registrations,
    queryFn: () => fetchAllRegistrations(authHeaders),
    queryClient,
    enabled,
    syncMode,
    getKey: (registration) => registration.id,
  });
}

export type AdminRegistrationsCollection = ReturnType<typeof createAdminRegistrationsCollection>;

type AuthHeadersProvider = () => Record<string, string>;

/**
 * The shared lifecycle (registry, session fence, timestamps, guarded writes);
 * see `adminCollectionFactory.ts`. Its fence advances whenever the set of
 * active collections changes or a collection is reset (sign-out), so a
 * live-event fetch that resolves afterwards is dropped instead of written into
 * the replacement state.
 */
const lifecycle = createAdminCollectionLifecycle<Registration, AdminRegistrationsCollection>({
  queryKey: queryKeys.admin.registrations,
});

export const registerAdminRegistrationsCollection = lifecycle.register;
export const resetAdminRegistrationsCollection = lifecycle.reset;

function isRegistrationCollectionLiveEvent(envelope: LiveEnvelope): boolean {
  if (!lifecycle.hasQueryKey(envelope)) return false;

  return ["check_in", "delivery", "order", "registration", "seating"].includes(envelope.topic);
}

export function canPatchAdminRegistrationLiveEvent(envelope: LiveEnvelope): boolean {
  return (
    lifecycle.hasActiveCollections() &&
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
  const isCurrent = lifecycle.captureFence();
  const eventTime = Date.parse(envelope.ts);
  if (isNaN(eventTime)) return;

  if (!lifecycle.claimEvent(registrationId, eventTime)) return;

  if (envelope.topic === "registration" && envelope.action === "deleted") {
    await lifecycle.writeToActive((collection) =>
      lifecycle.deleteIfPresent(collection, registrationId),
    );
    return;
  }

  const registration = await fetchRegistration(registrationId, authHeaders);

  // Sign-out or a collection swap happened while the booking was in flight.
  if (!isCurrent()) return;

  if (!lifecycle.isLatestEvent(registrationId, eventTime)) return;

  await lifecycle.writeToActive((collection) => collection.utils.writeUpsert(registration));
}

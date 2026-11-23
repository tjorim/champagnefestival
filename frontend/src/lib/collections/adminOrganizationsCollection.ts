import type { QueryClient } from "@tanstack/react-query";
import {
  createAdminCollection,
  createAdminCollectionLifecycle,
  type AdminCollectionSyncMode,
} from "./adminCollectionFactory";
import type { Organization } from "@/types/admin";
import { fetchOrganizations } from "../api/adminFetch";
import { queryKeys } from "../query/queryKeys";

interface CreateAdminOrganizationsCollectionOptions {
  queryClient: QueryClient;

  enabled: boolean;
  syncMode?: AdminCollectionSyncMode;
}

/**
 * Every organization, keyed by its numeric id.
 *
 * Rows are written from the server's response after the API call succeeds
 * (the content section forms validate server-side, so there are no optimistic
 * write handlers). The response is the whole row and nothing else changes
 * with it, so a save or delete needs no follow-up refetch; a people merge,
 * which the server applies to rows this collection did not receive, refetches
 * through `refetchAdminOrganizations`.
 */
export function createAdminOrganizationsCollection({
  queryClient,

  enabled,
  syncMode,
}: CreateAdminOrganizationsCollectionOptions) {
  return createAdminCollection<Organization, number>({
    queryKey: queryKeys.admin.organizations,
    queryFn: () => fetchOrganizations(),
    queryClient,
    enabled,
    syncMode,
    getKey: (organization) => organization.id,
  });
}

export type AdminOrganizationsCollection = ReturnType<typeof createAdminOrganizationsCollection>;

/**
 * The shared lifecycle (registry, session fence, guarded writes); see
 * `adminCollectionFactory.ts`. Its fence advances whenever the collection is
 * replaced or reset (sign-out), so a response that resolves afterwards is
 * dropped instead of written into the replacement state.
 */
const lifecycle = createAdminCollectionLifecycle<
  Organization,
  AdminOrganizationsCollection,
  number
>({
  queryKey: queryKeys.admin.organizations,
});

/** Captures the current session for a write that follows an API call. */
export const captureAdminOrganizationsFence = lifecycle.captureFence;

/**
 * Marks the collection as mounted. A mount or unmount (a new collection
 * replacing the old one) invalidates every capture taken for the previous one.
 */
export const registerAdminOrganizationsCollection = lifecycle.register;

/** Empties the collection (sign-out) and drops every write still waiting on an API response. */
export const resetAdminOrganizationsCollection = lifecycle.reset;

/**
 * Refetches the organizations from the server. Failures stay on
 * `collectionError(collection)`, which the dashboard already surfaces. With
 * `isCurrent`, a refetch that follows a response from an earlier session is
 * skipped, so it cannot repopulate the query a sign-out removed.
 */
export async function refetchAdminOrganizations(
  collection: AdminOrganizationsCollection,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return;
  await lifecycle.refetch(collection);
}

/**
 * Applies the local effect of a successful write. The server already
 * committed, so a response that belongs to an earlier session is dropped and a
 * local failure (for example a collection whose sync has not started) is not
 * reported as a failed action: the next load brings the collection back in line.
 */
async function applyWrite(isCurrent: () => boolean, write: () => Promise<void>): Promise<void> {
  if (!isCurrent()) return;
  try {
    await write();
  } catch {
    // Reconciled by the next refetch.
  }
}

/** Apply the complete saved API record without maintaining a second projection. */
export function applyAdminOrganizationSaved(
  collection: AdminOrganizationsCollection,
  organization: Organization,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () => collection.utils.writeUpsert(organization));
}

/** A deleted organization. */
export function applyAdminOrganizationDeleted(
  collection: AdminOrganizationsCollection,
  id: number,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () => lifecycle.deleteIfPresent(collection, id));
}

/**
 * Applies a people merge: every organization whose contact was the duplicate now
 * points at the surviving person, as the server already did.
 */
export function applyAdminOrganizationContactsMerged(
  collection: AdminOrganizationsCollection,
  duplicateId: string,
  canonicalId: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    const repointed = Array.from(collection.values())
      .filter((organization) => organization.contact_person_id === duplicateId)
      .map((organization) => ({ ...organization, contact_person_id: canonicalId }));
    if (repointed.length > 0) await collection.utils.writeUpsert(repointed);
  });
}

import type { QueryClient } from "@tanstack/react-query";
import {
  createAdminCollection,
  createAdminCollectionLifecycle,
  type AdminCollectionSyncMode,
} from "@/state/adminCollectionFactory";
import type { Exhibitor } from "@/types/admin";
import { fetchExhibitors } from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";

type AuthHeadersProvider = () => Record<string, string>;

interface CreateAdminExhibitorsCollectionOptions {
  queryClient: QueryClient;
  authHeaders: AuthHeadersProvider;
  enabled: boolean;
  syncMode?: AdminCollectionSyncMode;
}

/**
 * Every exhibitor, keyed by its numeric id.
 *
 * Rows are written from the server's response after the API call succeeds
 * (the content section forms validate server-side, so there are no optimistic
 * write handlers). The response is the whole row and nothing else changes
 * with it, so a save or delete needs no follow-up refetch; a people merge,
 * which the server applies to rows this collection did not receive, refetches
 * through `refetchAdminExhibitors`.
 */
export function createAdminExhibitorsCollection({
  queryClient,
  authHeaders,
  enabled,
  syncMode,
}: CreateAdminExhibitorsCollectionOptions) {
  return createAdminCollection<Exhibitor, number>({
    queryKey: queryKeys.admin.exhibitors,
    queryFn: () => fetchExhibitors(authHeaders),
    queryClient,
    enabled,
    syncMode,
    getKey: (exhibitor) => exhibitor.id,
  });
}

export type AdminExhibitorsCollection = ReturnType<typeof createAdminExhibitorsCollection>;

/**
 * The shared lifecycle (registry, session fence, guarded writes); see
 * `adminCollectionFactory.ts`. Its fence advances whenever the collection is
 * replaced or reset (sign-out), so a response that resolves afterwards is
 * dropped instead of written into the replacement state.
 */
const lifecycle = createAdminCollectionLifecycle<Exhibitor, AdminExhibitorsCollection, number>({
  queryKey: queryKeys.admin.exhibitors,
});

/** Captures the current session for a write that follows an API call. */
export const captureAdminExhibitorsFence = lifecycle.captureFence;

/**
 * Marks the collection as mounted. A mount or unmount (a new collection
 * replacing the old one) invalidates every capture taken for the previous one.
 */
export const registerAdminExhibitorsCollection = lifecycle.register;

/** Empties the collection (sign-out) and drops every write still waiting on an API response. */
export const resetAdminExhibitorsCollection = lifecycle.reset;

/**
 * Refetches the exhibitors from the server. Failures stay on
 * `collection.utils.lastError`, which the dashboard already surfaces. With
 * `isCurrent`, a refetch that follows a response from an earlier session is
 * skipped, so it cannot repopulate the query a sign-out removed.
 */
export async function refetchAdminExhibitors(
  collection: AdminExhibitorsCollection,
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

/**
 * A saved exhibitor (created, edited, archived or restored). Only the fields
 * the dashboard reads are kept from the content section's item.
 */
export function applyAdminExhibitorSaved(
  collection: AdminExhibitorsCollection,
  exhibitor: Pick<Exhibitor, "id" | "name"> & Partial<Exhibitor>,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () =>
    collection.utils.writeUpsert({
      id: exhibitor.id,
      name: exhibitor.name,
      active: exhibitor.active ?? true,
      contactPersonId: exhibitor.contactPersonId ?? null,
    }),
  );
}

/** A deleted exhibitor. */
export function applyAdminExhibitorDeleted(
  collection: AdminExhibitorsCollection,
  id: number,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () => lifecycle.deleteIfPresent(collection, id));
}

/**
 * Applies a people merge: every exhibitor whose contact was the duplicate now
 * points at the surviving person, as the server already did.
 */
export function applyAdminExhibitorContactsMerged(
  collection: AdminExhibitorsCollection,
  duplicateId: string,
  canonicalId: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    const repointed = Array.from(collection.values())
      .filter((exhibitor) => exhibitor.contactPersonId === duplicateId)
      .map((exhibitor) => ({ ...exhibitor, contactPersonId: canonicalId }));
    if (repointed.length > 0) await collection.utils.writeUpsert(repointed);
  });
}

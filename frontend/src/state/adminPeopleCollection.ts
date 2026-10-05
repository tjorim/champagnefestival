import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import { createEpochFence } from "@/state/epochFence";
import type { Person } from "@/types/person";
import { fetchMembers, fetchPeople } from "@/utils/adminFetch";
import { mergePersonUpdate, mergeVolunteerPerson } from "@/utils/adminApiMappers";
import { queryKeys } from "@/utils/queryKeys";

type AuthHeadersProvider = () => Record<string, string>;

interface CreateAdminPeopleCollectionsOptions {
  queryClient: QueryClient;
  authHeaders: AuthHeadersProvider;
  enabled: boolean;
}

/**
 * `people` is every person (with their volunteer help periods merged in);
 * `members` is the subset holding the member role. They are two server
 * resources, so they are two collections, but they are always created, reset
 * and written together: one person change reaches both through the helpers
 * below instead of two hand-written cache patches.
 *
 * Rows are written from the server's response after the API call succeeds
 * (the admin forms validate server-side and report errors in the modal), so
 * there are no optimistic write handlers. Each mutation then refetches the
 * collections explicitly through `refetchAdminPeople`.
 */
export function createAdminPeopleCollections({
  queryClient,
  authHeaders,
  enabled,
}: CreateAdminPeopleCollectionsOptions) {
  const people = createCollection(
    queryCollectionOptions({
      queryKey: queryKeys.admin.people,
      queryFn: () => fetchPeople(authHeaders),
      queryClient,
      enabled,
      staleTime: 60 * 1000,
      retry: false,
      getKey: (person) => person.id,
    }),
  );
  const members = createCollection(
    queryCollectionOptions({
      queryKey: queryKeys.admin.members,
      queryFn: () => fetchMembers(authHeaders),
      queryClient,
      enabled,
      staleTime: 60 * 1000,
      retry: false,
      getKey: (member) => member.id,
    }),
  );
  return { people, members };
}

export type AdminPeopleCollections = ReturnType<typeof createAdminPeopleCollections>;
type AdminPeopleCollection = AdminPeopleCollections["people"] | AdminPeopleCollections["members"];

/**
 * Advanced whenever the set of active collections changes or the collections
 * are reset (sign-out), so a response that resolves afterwards is dropped
 * instead of written into the replacement state; see `epochFence.ts`.
 */
const peopleFence = createEpochFence();

/** Captures the current session for a write that follows an API call. */
export const captureAdminPeopleFence = peopleFence.capture;

/**
 * Marks a collection pair as mounted. A mount or unmount (a new pair replacing
 * the old one) invalidates every capture taken for the previous pair.
 */
export function registerAdminPeopleCollections(): () => void {
  peopleFence.advance();
  return () => peopleFence.advance();
}

async function clearCollection(collection: AdminPeopleCollection): Promise<void> {
  if (collection.size === 0) return;
  await collection.utils.writeBatch(() => {
    for (const key of collection.keys()) void collection.utils.writeDelete(key);
  });
}

/** Empties both collections (sign-out) and drops every write still waiting on an API response. */
export async function resetAdminPeopleCollections(
  collections: AdminPeopleCollections,
): Promise<void> {
  peopleFence.advance();
  const results = await Promise.allSettled([
    clearCollection(collections.people),
    clearCollection(collections.members),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

type AdminPeopleResource = "people" | "members";

/**
 * Refetches the given collections from the server (the implicit refetch after a
 * write is deprecated, so every write refetches explicitly). Failures stay on
 * `collection.utils.lastError`, which the dashboard already surfaces.
 */
export async function refetchAdminPeople(
  collections: AdminPeopleCollections,
  resources: readonly AdminPeopleResource[] = ["people", "members"],
): Promise<void> {
  await Promise.all(
    resources.map((resource) => collections[resource].utils.refetch().catch(() => undefined)),
  );
}

/**
 * The per-person queries (`["admin", "people", id, ...]`) share the people
 * collection's key prefix but are plain queries, so a person change has to
 * invalidate them itself now that the whole prefix is no longer invalidated.
 */
export function invalidateAdminPersonDetailQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.admin.people,
    predicate: (query) => query.queryKey.length > queryKeys.admin.people.length,
  });
}

/**
 * Deleting a key the collection no longer holds throws, and a row can already
 * be gone (a refetch or a reset got there first), so only delete what is
 * still present.
 */
async function removeRow(collection: AdminPeopleCollection, id: string): Promise<void> {
  if (collection.has(id)) await collection.utils.writeDelete(id);
}

async function upsertRow(collection: AdminPeopleCollection, person: Person): Promise<void> {
  await collection.utils.writeUpsert(person);
}

/** Replaces a row only when the collection already holds it; an absent row is not invented. */
async function replaceRow(
  collection: AdminPeopleCollection,
  id: string,
  next: (existing: Person) => Person,
): Promise<void> {
  const existing = collection.get(id);
  if (existing) await upsertRow(collection, next(existing));
}

/** Keeps `members` aligned with a person's member role: add or refresh a member, drop a non-member. */
async function syncMember(members: AdminPeopleCollections["members"], person: Person) {
  if (person.roles.includes("member")) await upsertRow(members, person);
  else await removeRow(members, person.id);
}

/**
 * Applies the local effect of a successful write. The server already
 * committed, so a response that belongs to an earlier session is dropped and a
 * local failure (for example a collection whose sync has not started) is not
 * reported as a failed action: the refetch that follows every write brings the
 * collections back in line.
 */
async function applyWrite(isCurrent: () => boolean, write: () => Promise<void>): Promise<void> {
  if (!isCurrent()) return;
  try {
    await write();
  } catch {
    // Reconciled by the explicit refetch that follows the write.
  }
}

export function applyAdminMemberCreated(
  collections: AdminPeopleCollections,
  member: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await upsertRow(collections.members, member);
    await upsertRow(collections.people, member);
  });
}

export function applyAdminMemberUpdated(
  collections: AdminPeopleCollections,
  member: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await replaceRow(collections.members, member.id, () => member);
    await replaceRow(collections.people, member.id, (existing) =>
      mergePersonUpdate(existing, member),
    );
  });
}

export function applyAdminPersonCreated(
  collections: AdminPeopleCollections,
  person: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await upsertRow(collections.people, person);
    await syncMember(collections.members, person);
  });
}

export function applyAdminPersonUpdated(
  collections: AdminPeopleCollections,
  person: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await replaceRow(collections.people, person.id, (existing) =>
      mergePersonUpdate(existing, person),
    );
    await syncMember(collections.members, person);
  });
}

/** A deleted person or member leaves both collections. */
export function applyAdminPersonDeleted(
  collections: AdminPeopleCollections,
  id: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await removeRow(collections.people, id);
    await removeRow(collections.members, id);
  });
}

export function applyAdminVolunteerCreated(
  collections: AdminPeopleCollections,
  volunteer: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await upsertRow(collections.people, mergeVolunteerPerson(undefined, volunteer));
  });
}

export function applyAdminVolunteerUpdated(
  collections: AdminPeopleCollections,
  volunteer: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await replaceRow(collections.people, volunteer.id, (existing) =>
      mergeVolunteerPerson(existing, volunteer),
    );
    await replaceRow(collections.members, volunteer.id, (member) => ({
      ...member,
      name: volunteer.name,
      address: volunteer.address,
      active: volunteer.active,
      updatedAt: volunteer.updatedAt,
    }));
  });
}

/** Deleting the volunteer record drops the role and help periods but keeps the person. */
export function applyAdminVolunteerDeleted(
  collections: AdminPeopleCollections,
  id: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await replaceRow(collections.people, id, (person) => ({
      ...person,
      roles: person.roles.filter((role) => role !== "volunteer"),
      helpPeriods: [],
    }));
  });
}

/**
 * Applies a people merge: the duplicate disappears and the survivor takes the
 * server's row. The merge response is a PersonOut, which carries no help
 * periods, so taking it verbatim would blank them out. Keep the ones the
 * survivor already had (the merge does not touch its own rows) but do not copy
 * the duplicate's across: the server re-points those now, and showing them here
 * regardless is what hid the cascade delete last time. The refetch after the
 * merge brings back the real set.
 */
export function applyAdminPeopleMerged(
  collections: AdminPeopleCollections,
  canonical: Person,
  duplicateId: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    const existingCanonical = collections.people.get(canonical.id);
    const merged = canonical.roles.includes("volunteer")
      ? { ...canonical, helpPeriods: existingCanonical?.helpPeriods ?? [] }
      : canonical;
    await removeRow(collections.people, duplicateId);
    await replaceRow(collections.people, canonical.id, () => merged);
    await removeRow(collections.members, duplicateId);
    await syncMember(collections.members, merged);
  });
}

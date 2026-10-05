import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import { createEpochFence } from "@/state/epochFence";
import type { Person } from "@/types/person";
import { fetchPeople } from "@/utils/adminFetch";
import { mergePersonUpdate, mergeVolunteerPerson } from "@/utils/adminApiMappers";
import { queryKeys } from "@/utils/queryKeys";

type AuthHeadersProvider = () => Record<string, string>;

interface CreateAdminPeopleCollectionOptions {
  queryClient: QueryClient;
  authHeaders: AuthHeadersProvider;
  enabled: boolean;
}

/**
 * Every person, with the volunteer help periods merged in. Members and
 * volunteers are not second copies: they are the rows holding the `member` or
 * `volunteer` role, derived from this collection (see `selectMembers` and
 * `selectVolunteers`), so a person change reaches those views without a second
 * patch.
 *
 * Rows are written from the server's response after the API call succeeds
 * (the admin forms validate server-side, so there are no optimistic write
 * handlers). Each mutation then refetches the collection explicitly through
 * `refetchAdminPeople`.
 */
export function createAdminPeopleCollection({
  queryClient,
  authHeaders,
  enabled,
}: CreateAdminPeopleCollectionOptions) {
  return createCollection(
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
}

export type AdminPeopleCollection = ReturnType<typeof createAdminPeopleCollection>;

/**
 * A role view over the people rows. Members and volunteers are not stored
 * separately: they are the people holding that role, so one person write reaches
 * every view.
 */
function selectPeopleWithRole(people: readonly Person[], role: string): Person[] {
  return people.filter((person) => person.roles.includes(role));
}

/** The members view: every person who holds the member role. */
export function selectMembers(people: readonly Person[]): Person[] {
  return selectPeopleWithRole(people, "member");
}

/** The volunteers view: every person who holds the volunteer role. */
export function selectVolunteers(people: readonly Person[]): Person[] {
  return selectPeopleWithRole(people, "volunteer");
}

/**
 * Advanced whenever the collection is replaced or reset (sign-out), so a
 * response that resolves afterwards is dropped instead of written into the
 * replacement state; see `epochFence.ts`.
 */
const peopleFence = createEpochFence();

/** Captures the current session for a write that follows an API call. */
export const captureAdminPeopleFence = peopleFence.capture;

/**
 * Marks the collection as mounted. A mount or unmount (a new collection
 * replacing the old one) invalidates every capture taken for the previous one.
 */
export function registerAdminPeopleCollection(): () => void {
  peopleFence.advance();
  return () => peopleFence.advance();
}

/** Empties the collection (sign-out) and drops every write still waiting on an API response. */
export async function resetAdminPeopleCollection(collection: AdminPeopleCollection): Promise<void> {
  peopleFence.advance();
  if (collection.size === 0) return;
  await collection.utils.writeBatch(() => {
    for (const key of collection.keys()) void collection.utils.writeDelete(key);
  });
}

/**
 * Refetches the people from the server (the implicit refetch after a write is
 * deprecated, so every write refetches explicitly). Failures stay on
 * `collection.utils.lastError`, which the dashboard already surfaces.
 */
export async function refetchAdminPeople(collection: AdminPeopleCollection): Promise<void> {
  await collection.utils.refetch().catch(() => undefined);
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

/** Replaces a row only when the collection already holds it; an absent row is not invented. */
async function replaceRow(
  collection: AdminPeopleCollection,
  id: string,
  next: (existing: Person) => Person,
): Promise<void> {
  const existing = collection.get(id);
  if (existing) await collection.utils.writeUpsert(next(existing));
}

/**
 * Applies the local effect of a successful write. The server already
 * committed, so a response that belongs to an earlier session is dropped and a
 * local failure (for example a collection whose sync has not started) is not
 * reported as a failed action: the refetch that follows every write brings the
 * collection back in line.
 */
async function applyWrite(isCurrent: () => boolean, write: () => Promise<void>): Promise<void> {
  if (!isCurrent()) return;
  try {
    await write();
  } catch {
    // Reconciled by the explicit refetch that follows the write.
  }
}

/** A created person or member. */
export function applyAdminPersonCreated(
  collection: AdminPeopleCollection,
  person: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () => collection.utils.writeUpsert(person));
}

/** An updated person or member; a volunteer keeps the help periods the row already holds. */
export function applyAdminPersonUpdated(
  collection: AdminPeopleCollection,
  person: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () =>
    replaceRow(collection, person.id, (existing) => mergePersonUpdate(existing, person)),
  );
}

/** A deleted person or member. */
export function applyAdminPersonDeleted(
  collection: AdminPeopleCollection,
  id: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () => removeRow(collection, id));
}

export function applyAdminVolunteerCreated(
  collection: AdminPeopleCollection,
  volunteer: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () =>
    collection.utils.writeUpsert(mergeVolunteerPerson(undefined, volunteer)),
  );
}

export function applyAdminVolunteerUpdated(
  collection: AdminPeopleCollection,
  volunteer: Person,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () =>
    replaceRow(collection, volunteer.id, (existing) => mergeVolunteerPerson(existing, volunteer)),
  );
}

/** Deleting the volunteer record drops the role and help periods but keeps the person. */
export function applyAdminVolunteerDeleted(
  collection: AdminPeopleCollection,
  id: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () =>
    replaceRow(collection, id, (person) => ({
      ...person,
      roles: person.roles.filter((role) => role !== "volunteer"),
      helpPeriods: [],
    })),
  );
}

/**
 * Applies a people merge: the duplicate disappears and the survivor takes the
 * server's row. The merge response is a PersonOut, which carries no help
 * periods, so taking it verbatim would blank them out. Keep the ones the
 * survivor already had (the merge does not touch its own rows) but do not copy
 * the duplicate's across: the server re-points those now, and showing them here
 * regardless is what hid the cascade delete last time. The refetch after the
 * merge brings back the real set.
 *
 * A survivor the collection does not hold yet is inserted so a failed refetch
 * cannot leave it missing. A volunteer's help periods then come from
 * `loadHelpPeriods`; without them the survivor is not inserted (the refetch
 * adds it), because an empty list would be shown as the real one.
 */
export function applyAdminPeopleMerged(
  collection: AdminPeopleCollection,
  canonical: Person,
  duplicateId: string,
  isCurrent: () => boolean,
  loadHelpPeriods?: () => Promise<Person["helpPeriods"]>,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    await removeRow(collection, duplicateId);
    // Only a volunteer carries help periods; the held row's own set is kept.
    let helpPeriods = canonical.roles.includes("volunteer")
      ? collection.get(canonical.id)?.helpPeriods
      : [];
    if (!helpPeriods) {
      helpPeriods = await loadHelpPeriods?.().catch(() => undefined);
      // The session may have ended while the periods were loading.
      if (!helpPeriods || !isCurrent()) return;
    }
    await collection.utils.writeUpsert({ ...canonical, helpPeriods });
  });
}

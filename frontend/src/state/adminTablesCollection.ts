import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import type { FloorTableRecord } from "@/types/admin";
import type { LiveEnvelope } from "@/utils/liveStream";
import { queryKeys } from "@/utils/queryKeys";
import { createEpochFence } from "@/state/epochFence";
import {
  createTable,
  deleteTable,
  fetchTable,
  fetchTables,
  updateTable,
  type TableCreateInput,
} from "@/utils/adminFetch";

type AuthHeadersProvider = () => Record<string, string>;

interface CreateAdminTablesCollectionOptions {
  queryClient: QueryClient;
  authHeaders: AuthHeadersProvider;
  enabled: boolean;
}

/**
 * The stored table rows. Occupancy (`registrationIds`) is deliberately not part
 * of a row: it is derived from the registrations collection (see
 * `tableOccupancy.ts`), so seating changes never need a second cache patch.
 *
 * Only updates run through a write handler, because they are optimistic (a
 * dragged table must follow the pointer and roll back on failure). Create and
 * delete are not optimistic: a create needs the server's id and capacity, and a
 * delete of an allocated table is rejected, so both call the API first and then
 * apply a direct write (see `useAdminVenueActions`).
 */
export function createAdminTablesCollection({
  queryClient,
  authHeaders,
  enabled,
}: CreateAdminTablesCollectionOptions) {
  return createCollection(
    queryCollectionOptions({
      queryKey: queryKeys.admin.tables,
      queryFn: () => fetchTables(authHeaders),
      queryClient,
      enabled,
      staleTime: 60 * 1000,
      retry: false,
      getKey: (table) => table.id,
      onUpdate: async ({ transaction, collection }) => {
        try {
          for (const mutation of transaction.mutations) {
            await updateTable(authHeaders, String(mutation.key), mutation.changes);
          }
        } catch (error) {
          // The write may or may not have committed; reconcile with the server
          // before the optimistic state is rolled back (see docs/retry-safety.md).
          await collection.utils.refetch().catch(() => undefined);
          throw error;
        }
        // Explicit refetch instead of the deprecated implicit one.
        await collection.utils.refetch();
        return { refetch: false };
      },
    }),
  );
}

export type AdminTablesCollection = ReturnType<typeof createAdminTablesCollection>;

/** Refetches the tables from the server; failures stay on `collection.utils.lastError`. */
export async function refetchAdminTables(collection: AdminTablesCollection): Promise<void> {
  await collection.utils.refetch().catch(() => undefined);
}

/**
 * Deleting a key the collection no longer holds throws, and a row can already
 * be gone (a live `deleted` event or a reset got there first), so only delete
 * what is still present.
 */
async function deleteIfPresent(collection: AdminTablesCollection, key: string): Promise<void> {
  if (collection.has(key)) await collection.utils.writeDelete(key);
}

/**
 * Creates a table through the API and stores the server's row. Not optimistic:
 * the server assigns the id and the table type's capacity. A response that
 * arrives after sign-out or a collection swap is dropped.
 */
export async function addAdminTable(
  collection: AdminTablesCollection,
  authHeaders: AuthHeadersProvider,
  input: TableCreateInput,
): Promise<void> {
  const isCurrent = tablesFence.capture();
  const table = await createTable(authHeaders, input);
  if (!isCurrent()) return;
  await collection.utils.writeUpsert(table);
}

/**
 * Deletes a table through the API and removes the row. Not optimistic: the
 * server rejects deleting a table that still holds bookings.
 */
export async function deleteAdminTable(
  collection: AdminTablesCollection,
  authHeaders: AuthHeadersProvider,
  tableId: string,
): Promise<void> {
  const isCurrent = tablesFence.capture();
  await deleteTable(authHeaders, tableId);
  if (!isCurrent()) return;
  await deleteIfPresent(collection, tableId);
}

/** Removes every table that belongs to one of the given layouts (a layout/venue delete cascade). */
export async function removeAdminTablesForLayouts(
  collection: AdminTablesCollection,
  layoutIds: ReadonlySet<string> | readonly string[],
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return;
  const ids = new Set(layoutIds);
  const keys = Array.from(collection.values())
    .filter((table) => ids.has(table.layoutId))
    .map((table) => table.id);
  if (keys.length === 0) return;
  await collection.utils.writeDelete(keys);
}

/** Replaces one layout's tables with `tables` in a single atomic write (a layout revision restore). */
export async function replaceAdminTablesForLayout(
  collection: AdminTablesCollection,
  layoutId: string,
  tables: readonly FloorTableRecord[],
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return;
  const keep = new Set(tables.map((table) => table.id));
  const stale = Array.from(collection.values())
    .filter((table) => table.layoutId === layoutId && !keep.has(table.id))
    .map((table) => table.id);
  await collection.utils.writeBatch(() => {
    if (stale.length > 0) void collection.utils.writeDelete(stale);
    if (tables.length > 0) void collection.utils.writeUpsert([...tables]);
  });
}

const activeAdminTablesCollections = new Set<AdminTablesCollection>();
const latestTableEventTimestamps = new Map<string, number>();

/**
 * Advanced whenever the set of active collections changes or a collection is
 * reset (sign-out); see `epochFence.ts`.
 */
const tablesFence = createEpochFence();

/** Captures the current session for a write that follows an API call. */
export const captureAdminTablesFence = tablesFence.capture;

export function registerAdminTablesCollection(collection: AdminTablesCollection): () => void {
  tablesFence.advance();
  activeAdminTablesCollections.add(collection);
  return () => {
    tablesFence.advance();
    activeAdminTablesCollections.delete(collection);
    if (activeAdminTablesCollections.size === 0) {
      latestTableEventTimestamps.clear();
    }
  };
}

export async function resetAdminTablesCollection(collection: AdminTablesCollection): Promise<void> {
  tablesFence.advance();
  latestTableEventTimestamps.clear();
  if (collection.size === 0) return;
  await collection.utils.writeBatch(() => {
    for (const key of collection.keys()) {
      void collection.utils.writeDelete(key);
      latestTableEventTimestamps.delete(key);
    }
  });
}

/**
 * Applies a write to every active collection and resolves once all of them have
 * applied it, rejecting with the first failure after every write has settled
 * (see the same helper in `adminRegistrationsCollection.ts`).
 */
async function writeToActiveCollections(
  write: (collection: AdminTablesCollection) => Promise<void>,
): Promise<void> {
  const results = await Promise.allSettled(
    Array.from(activeAdminTablesCollections, async (collection) => write(collection)),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

export function hasAdminTablesKey(envelope: LiveEnvelope): boolean {
  return envelope.keys.some(
    (key) =>
      key.length === queryKeys.admin.tables.length &&
      key.every((part, index) => part === queryKeys.admin.tables[index]),
  );
}

/**
 * A seating event scoped to a registration is an allocation change. It alters
 * the registration (patched or refetched through the registrations key) and
 * therefore the derived occupancy, but never a stored table row, so the tables
 * key it carries needs no work at all.
 */
export function isTableRowUnaffectedByLiveEvent(envelope: LiveEnvelope): boolean {
  return (
    envelope.topic === "seating" &&
    typeof envelope.scope?.registration_id === "string" &&
    envelope.scope.registration_id.length > 0
  );
}

/** True for a table create/update/delete event that can be applied to one row. */
export function canPatchAdminTableLiveEvent(envelope: LiveEnvelope): boolean {
  return (
    activeAdminTablesCollections.size > 0 &&
    envelope.topic === "seating" &&
    hasAdminTablesKey(envelope) &&
    !isTableRowUnaffectedByLiveEvent(envelope) &&
    typeof envelope.scope?.table_id === "string" &&
    envelope.scope.table_id.length > 0
  );
}

export async function patchAdminTableLiveEvent(
  envelope: LiveEnvelope,
  authHeaders: AuthHeadersProvider,
): Promise<void> {
  if (!canPatchAdminTableLiveEvent(envelope)) {
    throw new Error("Live event cannot be applied incrementally.");
  }

  const tableId = envelope.scope.table_id!;
  const isCurrent = tablesFence.capture();
  const eventTime = Date.parse(envelope.ts);
  if (isNaN(eventTime)) return;

  const lastTime = latestTableEventTimestamps.get(tableId);
  if (lastTime !== undefined && eventTime < lastTime) return;
  latestTableEventTimestamps.set(tableId, eventTime);

  if (envelope.action === "deleted") {
    await writeToActiveCollections((collection) => deleteIfPresent(collection, tableId));
    return;
  }

  const table = await fetchTable(tableId, authHeaders);

  // Sign-out or a collection swap happened while the row was in flight.
  if (!isCurrent()) return;

  const currentLastTime = latestTableEventTimestamps.get(tableId);
  if (currentLastTime !== undefined && eventTime < currentLastTime) return;

  await writeToActiveCollections((collection) => collection.utils.writeUpsert(table));
}

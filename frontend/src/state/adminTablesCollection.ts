import type { QueryClient } from "@tanstack/react-query";
import type { FloorTableRecord } from "@/types/admin";
import type { LiveEnvelope } from "@/utils/liveStream";
import { queryKeys } from "@/utils/queryKeys";
import {
  createAdminCollection,
  createAdminCollectionLifecycle,
  type AdminCollectionSyncMode,
} from "@/state/adminCollectionFactory";
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
  syncMode?: AdminCollectionSyncMode;
}

/**
 * The stored table rows. Occupancy (`registrationIds`) is deliberately not part
 * of a row: it is derived from the registrations collection (see
 * `tableOccupancy.ts`), so seating changes never need a second cache patch.
 *
 * Updates and deletes run through write handlers because the client knows the
 * outcome up front: a dragged table must follow the pointer, and a deleted
 * table disappears at once, both rolling back if the server refuses. Create is
 * not optimistic: the server assigns the id and the table type's capacity, so
 * `addAdminTable` calls the API first and then applies a direct write.
 */
/**
 * Runs a write handler's API calls, then refetches explicitly (the implicit
 * refetch after a handler is deprecated, so handlers return `{ refetch: false }`).
 * If a call fails the write may or may not have committed, so the server state is
 * refetched before the optimistic change is rolled back (see docs/retry-safety.md).
 */
async function persistThenRefetch(
  collection: { utils: { refetch: () => Promise<unknown> } },
  persist: () => Promise<void>,
): Promise<void> {
  try {
    await persist();
  } catch (error) {
    await collection.utils.refetch().catch(() => undefined);
    throw error;
  }
  await collection.utils.refetch();
}

export function createAdminTablesCollection({
  queryClient,
  authHeaders,
  enabled,
  syncMode,
}: CreateAdminTablesCollectionOptions) {
  return createAdminCollection<FloorTableRecord>({
    queryKey: queryKeys.admin.tables,
    queryFn: () => fetchTables(authHeaders),
    queryClient,
    enabled,
    syncMode,
    getKey: (table) => table.id,
    onUpdate: async ({ transaction, collection }) => {
      await persistThenRefetch(collection, async () => {
        for (const mutation of transaction.mutations) {
          await updateTable(authHeaders, String(mutation.key), mutation.changes);
        }
      });
      return { refetch: false };
    },
    onDelete: async ({ transaction, collection }) => {
      await persistThenRefetch(collection, async () => {
        for (const mutation of transaction.mutations) {
          await deleteTable(authHeaders, String(mutation.key));
        }
      });
      return { refetch: false };
    },
  });
}

export type AdminTablesCollection = ReturnType<typeof createAdminTablesCollection>;

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
  const isCurrent = captureAdminTablesFence();
  const table = await createTable(authHeaders, input);
  if (!isCurrent()) return;
  await collection.utils.writeUpsert(table);
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

/**
 * The shared lifecycle (registry, session fence, timestamps, guarded writes);
 * see `adminCollectionFactory.ts`. Its fence advances whenever the set of
 * active collections changes or a collection is reset (sign-out).
 */
const lifecycle = createAdminCollectionLifecycle<FloorTableRecord, AdminTablesCollection>({
  queryKey: queryKeys.admin.tables,
});

/** Captures the current session for a write that follows an API call. */
export const captureAdminTablesFence = lifecycle.captureFence;
export const registerAdminTablesCollection = lifecycle.register;
export const resetAdminTablesCollection = lifecycle.reset;

/** Refetches the tables from the server; failures stay on `collection.utils.lastError`. */
export const refetchAdminTables = lifecycle.refetch;

export const hasAdminTablesKey = lifecycle.hasQueryKey;

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
    lifecycle.hasActiveCollections() &&
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
  const isCurrent = captureAdminTablesFence();
  const eventTime = Date.parse(envelope.ts);
  if (isNaN(eventTime)) return;

  if (!lifecycle.claimEvent(tableId, eventTime)) return;

  if (envelope.action === "deleted") {
    await lifecycle.writeToActive((collection) => lifecycle.deleteIfPresent(collection, tableId));
    return;
  }

  const table = await fetchTable(tableId, authHeaders);

  // Sign-out or a collection swap happened while the row was in flight.
  if (!isCurrent()) return;

  if (!lifecycle.isLatestEvent(tableId, eventTime)) return;

  await lifecycle.writeToActive((collection) => collection.utils.writeUpsert(table));
}

import type { QueryClient } from "@tanstack/react-query";
import type { FloorArea, Layout, Room, TableType, Venue } from "@/types/admin";
import {
  createAdminCollection,
  createAdminCollectionLifecycle,
  persistThenRefetch,
  type AdminCollectionSyncMode,
  type AdminLifecycleCollection,
} from "@/state/adminCollectionFactory";
import {
  fetchAreas,
  fetchLayouts,
  fetchRooms,
  fetchTableTypes,
  fetchVenues,
  updateArea,
} from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";

type AuthHeadersProvider = () => Record<string, string>;

interface CreateAdminVenueCollectionsOptions {
  queryClient: QueryClient;
  authHeaders: AuthHeadersProvider;
  enabled: boolean;
  syncMode?: AdminCollectionSyncMode;
}

/**
 * The venue group: venues, rooms, table types, layouts and areas. They change
 * together (a venue delete reaches its rooms, layouts and areas; a layout delete
 * or revision restore rewrites its areas), so they are built, registered and
 * reset as one group, but each resource has exactly one collection and one
 * authoritative copy of its rows. Views such as "the rooms of a venue" are
 * derived from the collections by the consumers, never stored again.
 *
 * Rows are written from the server's response after the API call succeeds
 * (the server assigns ids and defaults), so there are no optimistic handlers
 * except for the area canvas edits (move, rotate, resize, relabel), where the
 * client knows the outcome up front and a dragged area must follow the pointer.
 * Every mutation refetches explicitly afterwards (`refetchAdminVenueCollection`).
 */
export function createAdminVenueCollections({
  queryClient,
  authHeaders,
  enabled,
  syncMode,
}: CreateAdminVenueCollectionsOptions) {
  const shared = { queryClient, enabled, syncMode };
  return {
    venues: createAdminCollection<Venue>({
      ...shared,
      queryKey: queryKeys.admin.venues,
      queryFn: () => fetchVenues(authHeaders),
      getKey: (venue) => venue.id,
    }),
    rooms: createAdminCollection<Room>({
      ...shared,
      queryKey: queryKeys.admin.rooms,
      queryFn: () => fetchRooms(authHeaders),
      getKey: (room) => room.id,
    }),
    tableTypes: createAdminCollection<TableType>({
      ...shared,
      queryKey: queryKeys.admin.tableTypes,
      queryFn: () => fetchTableTypes(authHeaders),
      getKey: (tableType) => tableType.id,
    }),
    layouts: createAdminCollection<Layout>({
      ...shared,
      queryKey: queryKeys.admin.layouts,
      queryFn: () => fetchLayouts(authHeaders),
      getKey: (layout) => layout.id,
    }),
    areas: createAdminCollection<FloorArea>({
      ...shared,
      queryKey: queryKeys.admin.areas,
      queryFn: () => fetchAreas(authHeaders),
      getKey: (area) => area.id,
      // Canvas edits are optimistic: one PUT per changed area, an explicit
      // refetch on success, and a refetch before the rollback on failure. The
      // session fence is taken before the first request: once it moves
      // (sign-out or a collection swap) no further PUT is sent and neither
      // refetch runs.
      onUpdate: async ({ transaction, collection }) => {
        const isCurrent = captureAdminVenueFence();
        await persistThenRefetch(
          collection,
          async () => {
            for (const mutation of transaction.mutations) {
              if (!isCurrent()) return;
              await updateArea(authHeaders, String(mutation.key), mutation.changes);
            }
          },
          isCurrent,
        );
        return { refetch: false };
      },
    }),
  };
}

export type AdminVenueCollections = ReturnType<typeof createAdminVenueCollections>;
export type AdminVenueCollectionName = keyof AdminVenueCollections;

const COLLECTION_NAMES: readonly AdminVenueCollectionName[] = [
  "venues",
  "rooms",
  "tableTypes",
  "layouts",
  "areas",
];

/**
 * One shared lifecycle per collection (registry, session fence, guarded
 * writes); see `adminCollectionFactory.ts`. They always advance together, so
 * the group fence below is true only while none of them has moved.
 */
const lifecycles = {
  venues: createAdminCollectionLifecycle<Venue, AdminVenueCollections["venues"]>({
    queryKey: queryKeys.admin.venues,
  }),
  rooms: createAdminCollectionLifecycle<Room, AdminVenueCollections["rooms"]>({
    queryKey: queryKeys.admin.rooms,
  }),
  tableTypes: createAdminCollectionLifecycle<TableType, AdminVenueCollections["tableTypes"]>({
    queryKey: queryKeys.admin.tableTypes,
  }),
  layouts: createAdminCollectionLifecycle<Layout, AdminVenueCollections["layouts"]>({
    queryKey: queryKeys.admin.layouts,
  }),
  areas: createAdminCollectionLifecycle<FloorArea, AdminVenueCollections["areas"]>({
    queryKey: queryKeys.admin.areas,
  }),
};

/**
 * Captures the current session for a write that follows an API call. The
 * returned check turns false after sign-out or when the collections are
 * replaced, so a response from an earlier session is never written into the
 * next one.
 */
export function captureAdminVenueFence(): () => boolean {
  const checks = COLLECTION_NAMES.map((name) => lifecycles[name].captureFence());
  return () => checks.every((isCurrent) => isCurrent());
}

/**
 * Marks the group as mounted. A mount or unmount (a new group replacing the
 * old one) invalidates every capture taken for the previous one.
 */
export function registerAdminVenueCollections(collections: AdminVenueCollections): () => void {
  const unregister = [
    lifecycles.venues.register(collections.venues),
    lifecycles.rooms.register(collections.rooms),
    lifecycles.tableTypes.register(collections.tableTypes),
    lifecycles.layouts.register(collections.layouts),
    lifecycles.areas.register(collections.areas),
  ];
  return () => {
    for (const fn of unregister) fn();
  };
}

/** Empties the group (sign-out) and drops every write still waiting on an API response. */
export async function resetAdminVenueCollections(
  collections: AdminVenueCollections,
): Promise<void> {
  const results = await Promise.allSettled([
    lifecycles.venues.reset(collections.venues),
    lifecycles.rooms.reset(collections.rooms),
    lifecycles.tableTypes.reset(collections.tableTypes),
    lifecycles.layouts.reset(collections.layouts),
    lifecycles.areas.reset(collections.areas),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

/**
 * Refetches one resource (or all of them) from the server. The implicit
 * refetch after a write is deprecated, so every write refetches explicitly.
 * Failures stay on `collection.utils.lastError`. With `isCurrent`, a refetch
 * that follows a write from an earlier session is skipped.
 */
export async function refetchAdminVenueCollections(
  collections: AdminVenueCollections,
  names: readonly AdminVenueCollectionName[] = COLLECTION_NAMES,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return;
  await Promise.all(names.map((name) => collections[name].utils.refetch().catch(() => undefined)));
}

type RowCollection<TRow extends { id: string }> = AdminLifecycleCollection<TRow>;

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

/** A row the server created (or any row to store verbatim). */
export function applyAdminVenueRowCreated<TRow extends { id: string }>(
  collection: RowCollection<TRow>,
  row: TRow,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () => collection.utils.writeUpsert(row));
}

/** A row the server updated; a row the collection does not hold is not invented. */
export function applyAdminVenueRowUpdated<TRow extends { id: string }>(
  collection: RowCollection<TRow>,
  row: TRow,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    if (collection.has(row.id)) await collection.utils.writeUpsert(row);
  });
}

/** Removes rows the collection still holds (`writeDelete` throws for a missing key). */
async function deleteRows<TRow extends { id: string }>(
  collection: RowCollection<TRow>,
  ids: Iterable<string>,
): Promise<void> {
  const present = Array.from(new Set(ids)).filter((id) => collection.has(id));
  if (present.length > 0) await collection.utils.writeDelete(present);
}

/** A deleted row. */
export function applyAdminVenueRowDeleted<TRow extends { id: string }>(
  collection: RowCollection<TRow>,
  id: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, () => deleteRows(collection, [id]));
}

/**
 * Applies a venue delete and its cascade: the venue, its rooms, those rooms'
 * layouts and those layouts' areas leave their collections. Returns the ids of
 * the removed layouts so the caller can remove their tables, which live in the
 * tables collection.
 */
export async function applyAdminVenueDeleted(
  collections: AdminVenueCollections,
  venueId: string,
  isCurrent: () => boolean,
): Promise<string[]> {
  if (!isCurrent()) return [];
  const roomIds = new Set(
    Array.from(collections.rooms.values())
      .filter((room) => room.venueId === venueId)
      .map((room) => room.id),
  );
  const layoutIds = new Set(
    Array.from(collections.layouts.values())
      .filter((layout) => roomIds.has(layout.roomId))
      .map((layout) => layout.id),
  );
  const areaIds = Array.from(collections.areas.values())
    .filter((area) => layoutIds.has(area.layoutId))
    .map((area) => area.id);
  await applyWrite(isCurrent, async () => {
    await deleteRows(collections.venues, [venueId]);
    await deleteRows(collections.rooms, roomIds);
    await deleteRows(collections.layouts, layoutIds);
    await deleteRows(collections.areas, areaIds);
  });
  return Array.from(layoutIds);
}

/** Applies a layout delete: the layout and its areas leave their collections. */
export function applyAdminLayoutDeleted(
  collections: AdminVenueCollections,
  layoutId: string,
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    const areaIds = Array.from(collections.areas.values())
      .filter((area) => area.layoutId === layoutId)
      .map((area) => area.id);
    await deleteRows(collections.layouts, [layoutId]);
    await deleteRows(collections.areas, areaIds);
  });
}

/** Replaces one layout's areas with `areas` in a single atomic write (a layout revision restore). */
export function replaceAdminAreasForLayout(
  collection: AdminVenueCollections["areas"],
  layoutId: string,
  areas: readonly FloorArea[],
  isCurrent: () => boolean,
): Promise<void> {
  return applyWrite(isCurrent, async () => {
    const keep = new Set(areas.map((area) => area.id));
    const stale = Array.from(collection.values())
      .filter((area) => area.layoutId === layoutId && !keep.has(area.id))
      .map((area) => area.id);
    await collection.utils.writeBatch(() => {
      if (stale.length > 0) void collection.utils.writeDelete(stale);
      if (areas.length > 0) void collection.utils.writeUpsert([...areas]);
    });
  });
}

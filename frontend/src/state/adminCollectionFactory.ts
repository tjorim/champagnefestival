import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions, type QueryCollectionConfig } from "@tanstack/query-db-collection";
import type { QueryClient, QueryFunctionContext, QueryKey } from "@tanstack/react-query";
import { createEpochFence } from "@/state/epochFence";
import type { LiveEnvelope } from "@/utils/liveStream";

/**
 * How a collection loads its rows.
 *
 * - `eager`: one full load of the resource when the collection starts. Every
 *   admin resource uses this today.
 * - `on-demand`: rows are loaded for the queries that ask for them (the
 *   server-driven tables of #1174). The `queryFn` then reads the requested
 *   subset from `context.meta.loadSubsetOptions`.
 *
 * Both modes share the same lifecycle (registration, sign-out reset, session
 * fence, guarded direct writes), so choosing a mode is the only difference a
 * collection has to state.
 */
export type AdminCollectionSyncMode = "eager" | "on-demand";

type AdminQueryFn<TRow extends object> = (
  context: QueryFunctionContext<QueryKey>,
) => Promise<TRow[]> | TRow[];

type SharedConfigKeys = "queryClient" | "enabled" | "staleTime" | "retry" | "syncMode" | "getKey";

export type AdminCollectionConfig<
  TRow extends object,
  TKey extends string | number = string,
> = Omit<
  QueryCollectionConfig<TRow, AdminQueryFn<TRow>, unknown, QueryKey, TKey>,
  SharedConfigKeys
> & {
  queryClient: QueryClient;
  /** Follows `visible && isAuthenticated` (and the role gate for admin-only resources). */
  enabled: boolean;
  /** Defaults to `"eager"`. */
  syncMode?: AdminCollectionSyncMode;
  getKey: (row: TRow) => TKey;
};

/**
 * Builds a collection with the admin app's shared query settings: 60 second
 * staleness, no automatic retry (a failed read surfaces on
 * `collection.utils.lastError`; see `docs/retry-safety.md`) and a selectable
 * sync mode. Write handlers (`onUpdate`/`onDelete`) pass straight through.
 */
export function createAdminCollection<TRow extends object, TKey extends string | number = string>({
  syncMode = "eager",
  ...config
}: AdminCollectionConfig<TRow, TKey>) {
  return createCollection(
    queryCollectionOptions<TRow, unknown, QueryKey, TKey>({
      staleTime: 60 * 1000,
      retry: false,
      ...config,
      syncMode,
    }),
  );
}

/** The part of a collection the lifecycle needs; every admin collection satisfies it. */
export interface AdminLifecycleCollection<
  TRow extends object,
  TKey extends string | number = string,
> {
  readonly size: number;
  keys(): IterableIterator<TKey>;
  has(key: TKey): boolean;
  get(key: TKey): TRow | undefined;
  utils: {
    refetch: () => Promise<unknown>;
    writeDelete: (keys: TKey | TKey[]) => Promise<void>;
    writeUpsert: (data: Partial<TRow> | Array<Partial<TRow>>) => Promise<void>;
    writeBatch: (callback: () => void) => Promise<void>;
  };
}

interface AdminCollectionLifecycleOptions {
  /** The query key the collection reads, matched against live-event envelope keys. */
  queryKey: QueryKey;
}

/**
 * The lifecycle every admin collection needs, shared instead of copied per
 * module. One instance belongs to one collection module and holds the state
 * that must be module-wide: the registry of mounted collections, the session
 * fence and the live-event timestamps.
 *
 * - `register` / `reset` advance the fence, so a write that follows an API
 *   call, or a live-event fetch, is dropped when the session ended or the
 *   collection was swapped while it was in flight (see `epochFence.ts`).
 * - `captureFence` is taken before the request; the returned check is
 *   evaluated before every post-await write.
 * - `deleteIfPresent` / `upsertIfPresent` are the presence-guarded direct
 *   writes: `writeDelete` throws for a missing key, and replacing a row the
 *   collection does not hold would invent one.
 * - `claimEvent` / `isLatestEvent` drop out-of-order live events per row id.
 */
export function createAdminCollectionLifecycle<
  TRow extends object,
  TCollection extends AdminLifecycleCollection<TRow, TKey>,
  TKey extends string | number = string,
>({ queryKey }: AdminCollectionLifecycleOptions) {
  const activeCollections = new Set<TCollection>();
  const latestEventTimestamps = new Map<string, number>();
  const fence = createEpochFence();

  /**
   * Marks the collection as mounted for live events. Returns the unregister
   * function; both directions invalidate every capture taken so far.
   */
  function register(collection: TCollection): () => void {
    fence.advance();
    activeCollections.add(collection);
    return () => {
      fence.advance();
      activeCollections.delete(collection);
      if (activeCollections.size === 0) latestEventTimestamps.clear();
    };
  }

  /** Empties the collection (sign-out) and drops every write still waiting on an API response. */
  async function reset(collection: TCollection): Promise<void> {
    fence.advance();
    latestEventTimestamps.clear();
    if (collection.size === 0) return;
    await collection.utils.writeBatch(() => {
      for (const key of collection.keys()) void collection.utils.writeDelete(key);
    });
  }

  /** Refetches from the server; failures stay on `collection.utils.lastError`. */
  async function refetch(collection: TCollection): Promise<void> {
    await collection.utils.refetch().catch(() => undefined);
  }

  /**
   * Deleting a key the collection no longer holds throws, and a row can already
   * be gone (a refetch, a live `deleted` event or a reset got there first), so
   * only delete what is still present.
   */
  async function deleteIfPresent(collection: TCollection, key: TKey): Promise<void> {
    if (collection.has(key)) await collection.utils.writeDelete(key);
  }

  /** Replaces a row only when the collection already holds it; an absent row is not invented. */
  async function upsertIfPresent(
    collection: TCollection,
    key: TKey,
    next: (existing: TRow) => TRow,
  ): Promise<void> {
    const existing = collection.get(key);
    if (existing) await collection.utils.writeUpsert(next(existing));
  }

  /**
   * Applies a write to every active collection and resolves once all of them
   * have applied it. Waits for every write to settle (so none is left running
   * behind a rejection) and then rejects with the first failure, including a
   * synchronous throw from a collection whose sync has not started.
   */
  async function writeToActive(write: (collection: TCollection) => Promise<void>): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(activeCollections, async (collection) => write(collection)),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }

  /** True when a live envelope carries exactly this collection's query key. */
  function hasQueryKey(envelope: LiveEnvelope): boolean {
    return envelope.keys.some(
      (key) =>
        key.length === queryKey.length && key.every((part, index) => part === queryKey[index]),
    );
  }

  /**
   * Records an event for a row. Returns false when a newer one was already
   * seen, so the caller drops the older event before doing any work.
   */
  function claimEvent(id: string, eventTime: number): boolean {
    const last = latestEventTimestamps.get(id);
    if (last !== undefined && eventTime < last) return false;
    latestEventTimestamps.set(id, eventTime);
    return true;
  }

  /** Re-checks ordering after an await: false when a newer event arrived while fetching. */
  function isLatestEvent(id: string, eventTime: number): boolean {
    const last = latestEventTimestamps.get(id);
    return last === undefined || eventTime >= last;
  }

  return {
    captureFence: fence.capture,
    register,
    reset,
    refetch,
    deleteIfPresent,
    upsertIfPresent,
    writeToActive,
    hasQueryKey,
    hasActiveCollections: () => activeCollections.size > 0,
    claimEvent,
    isLatestEvent,
  };
}

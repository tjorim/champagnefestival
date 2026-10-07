import { QueryClient, hydrate, dehydrate, type QueryKey } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type PersistedClient,
  type Persister,
} from "@tanstack/query-persist-client-core";
import { AdminCacheStorage } from "./adminCacheStorage";
import { queryKeys } from "@/utils/queryKeys";

export const ADMIN_CACHE_MAX_AGE = 72 * 60 * 60 * 1000;
/** Bump whenever any allowlisted frontend row shape changes. */
export const ADMIN_CACHE_BUSTER = "admin-collections-1";
export const ADMIN_CACHE_WRITE_DELAY = 1000;
export const ADMIN_CACHE_WIPE_SIGNAL = "champagne-admin-cache-wipe";

const keys = [
  queryKeys.admin.tables,
  queryKeys.admin.venues,
  queryKeys.admin.rooms,
  queryKeys.admin.tableTypes,
  queryKeys.admin.layouts,
  queryKeys.admin.areas,
  queryKeys.admin.exhibitors,
];
const sameKey = (a: QueryKey, b: QueryKey) =>
  a.length === b.length && a.every((part, index) => part === b[index]);

export function isPersistableAdminKey(key: QueryKey, editionId: string) {
  return (
    keys.some((allowed) => sameKey(key, allowed)) ||
    (!!editionId && sameKey(key, queryKeys.admin.registrationsEdition(editionId)))
  );
}

/** Detail/live responses may carry fields the list endpoint intentionally omits. */
function safeCopy<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, item: unknown) =>
      [
        "checkInToken",
        "check_in_token",
        "niss",
        "NISS",
        "eid",
        "eID",
        "nationalRegisterNumber",
        "national_register_number",
        "eidDocumentNumber",
        "eid_document_number",
      ].includes(key)
        ? undefined
        : item,
    ),
  ) as T;
}

interface StoredCache {
  owner: string;
  editionId: string;
  client: PersistedClient;
}
export interface CacheStatus {
  editionId: string;
  restored: boolean;
  warmStart: boolean;
  lastSynced: number;
}
const emptyStatus: CacheStatus = {
  editionId: "",
  restored: false,
  warmStart: false,
  lastSynced: 0,
};

/** Owns restore ordering and the async session fence independently of the dashboard. */
export class AdminCachePersistence {
  private epoch = 0;
  private owner: string | null = null;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private status = emptyStatus;
  private restoredKeys = new Set<string>();
  private listeners = new Set<() => void>();
  private ready: Promise<void> = Promise.resolve();
  private sessionStarted = false;

  private queryClient: QueryClient;
  private storage: AdminCacheStorage;
  constructor(queryClient: QueryClient, storage = new AdminCacheStorage()) {
    this.queryClient = queryClient;
    this.storage = storage;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.status;
  private publish(status: CacheStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }

  private stop() {
    this.epoch++;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearTimeout(this.timer);
    clearTimeout(this.expiryTimer);
    this.timer = undefined;
  }

  wipe(broadcast = false): Promise<void> {
    this.stop();
    this.owner = null;
    this.restoredKeys.clear();
    this.publish(emptyStatus);
    this.queryClient.removeQueries({ queryKey: ["admin"] });
    if (broadcast) {
      try {
        localStorage.setItem(ADMIN_CACHE_WIPE_SIGNAL, crypto.randomUUID());
      } catch {
        /* Storage disabled. */
      }
    }
    return this.storage.remove().catch(() => undefined);
  }

  private persister(epoch: number, owner: string): Persister {
    const current = () => this.epoch === epoch && this.owner === owner;
    return {
      persistClient: async (client) => {
        if (!current()) return;
        const safe = safeCopy(client);
        // Never serialize mutations or queries outside the current whole-key allowlist.
        safe.clientState.mutations = [];
        safe.clientState.queries = safe.clientState.queries
          .filter((query) => isPersistableAdminKey(query.queryKey, this.status.editionId))
          .map((query) => ({
            ...query,
            state: {
              ...query.state,
              status: "success",
              fetchStatus: "idle",
              error: null,
              fetchFailureReason: null,
              fetchFailureCount: 0,
            },
          }));
        await this.storage
          .write({ owner, editionId: this.status.editionId, client: safe }, current)
          .catch(() => undefined);
      },
      restoreClient: async () => {
        const stored = (await this.storage.read().catch(() => undefined)) as
          | StoredCache
          | undefined;
        if (!current()) return undefined;
        if (!stored) return undefined;
        if (
          stored.owner !== owner ||
          !stored.client ||
          typeof stored.editionId !== "string" ||
          stored.client.buster !== ADMIN_CACHE_BUSTER ||
          !stored.client.timestamp ||
          Date.now() - stored.client.timestamp >= ADMIN_CACHE_MAX_AGE
        ) {
          await this.storage.remove().catch(() => undefined);
          return undefined;
        }
        const client = safeCopy(stored.client);
        client.clientState.mutations = [];
        client.clientState.queries = client.clientState.queries.filter((query) =>
          isPersistableAdminKey(query.queryKey, stored.editionId),
        );
        this.restoredKeys = new Set(client.clientState.queries.map((query) => query.queryHash));
        this.publish({
          editionId: stored.editionId,
          restored: client.clientState.queries.length > 0,
          warmStart: client.clientState.queries.length > 0,
          lastSynced: client.clientState.queries.length
            ? Math.min(...client.clientState.queries.map((query) => query.state.dataUpdatedAt))
            : 0,
        });
        this.expiryTimer = setTimeout(
          () => {
            void this.wipe();
          },
          Math.max(0, ADMIN_CACHE_MAX_AGE - (Date.now() - client.timestamp)),
        );
        return client;
      },
      removeClient: () => this.storage.remove().catch(() => undefined),
    };
  }

  setSession(owner: string | null): Promise<void> {
    if (this.sessionStarted && owner === this.owner) return this.ready;
    this.sessionStarted = true;
    const changed = this.owner !== null && this.owner !== owner;
    this.stop();
    this.owner = owner;
    const epoch = this.epoch;
    if (!owner) return (this.ready = this.wipe());
    const persister = this.persister(epoch, owner);
    this.ready = (async () => {
      if (changed) {
        this.queryClient.removeQueries({ queryKey: ["admin"] });
        this.publish(emptyStatus);
        await persister.removeClient();
      }
      const staging = new QueryClient();
      await persistQueryClientRestore({
        queryClient: staging,
        persister,
        buster: ADMIN_CACHE_BUSTER,
        maxAge: ADMIN_CACHE_MAX_AGE,
        hydrateOptions: { defaultOptions: { queries: { gcTime: ADMIN_CACHE_MAX_AGE } } },
      }).catch(() => undefined);
      if (epoch !== this.epoch) {
        staging.clear();
        return;
      }
      hydrate(
        this.queryClient,
        dehydrate(staging, { shouldDehydrateQuery: (query) => query.state.data !== undefined }),
        { defaultOptions: { queries: { gcTime: ADMIN_CACHE_MAX_AGE } } },
      );
      staging.clear();
      this.unsubscribe = this.queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "success") return;
        if (sameKey(event.query.queryKey, queryKeys.admin.activeEdition)) {
          const edition = event.query.state.data as { id?: string } | undefined;
          void this.setEdition(edition?.id ?? "");
          return;
        }
        if (!isPersistableAdminKey(event.query.queryKey, this.status.editionId)) return;
        this.restoredKeys.delete(event.query.queryHash);
        const times = this.queryClient
          .getQueryCache()
          .getAll()
          .filter(
            (query) =>
              isPersistableAdminKey(query.queryKey, this.status.editionId) &&
              query.state.data !== undefined,
          )
          .map((query) => query.state.dataUpdatedAt);
        this.publish({
          ...this.status,
          restored: this.restoredKeys.size > 0,
          lastSynced: Math.min(...times),
        });
        clearTimeout(this.expiryTimer);
        this.expiryTimer = setTimeout(() => {
          void this.wipe();
        }, ADMIN_CACHE_MAX_AGE);
        if (this.timer) return;
        this.timer = setTimeout(() => {
          this.timer = undefined;
          if (epoch !== this.epoch) return;
          void persistQueryClientSave({
            queryClient: this.queryClient,
            persister,
            buster: ADMIN_CACHE_BUSTER,
            dehydrateOptions: {
              shouldDehydrateMutation: () => false,
              shouldDehydrateQuery: (query) =>
                query.state.data !== undefined &&
                isPersistableAdminKey(query.queryKey, this.status.editionId),
            },
          }).catch(() => undefined);
        }, ADMIN_CACHE_WRITE_DELAY);
      });
      const edition = this.queryClient.getQueryData<{ id: string }>(queryKeys.admin.activeEdition);
      if (edition) await this.setEdition(edition.id);
    })();
    return this.ready;
  }

  async setEdition(editionId: string) {
    if (editionId === this.status.editionId) return;
    const owner = this.owner;
    // A first network answer must validate (or replace) the restored edition.
    this.stop();
    const epoch = this.epoch;
    this.restoredKeys.clear();
    this.publish({ editionId, restored: false, warmStart: false, lastSynced: 0 });
    this.queryClient.removeQueries({
      queryKey: queryKeys.admin.registrations,
      predicate: (query) => query.queryKey[2] === "edition" && query.queryKey[3] !== editionId,
    });
    await this.storage.remove().catch(() => undefined);
    if (this.epoch !== epoch || this.owner !== owner || !owner) return;
    this.sessionStarted = false;
    await this.setSession(owner);
  }
}

const controllers = new WeakMap<QueryClient, AdminCachePersistence>();
export function adminCachePersistence(client: QueryClient) {
  let controller = controllers.get(client);
  if (!controller) {
    controller = new AdminCachePersistence(client);
    controllers.set(client, controller);
  }
  return controller;
}

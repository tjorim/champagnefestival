import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdminCollection,
  createAdminCollectionLifecycle,
} from "@/state/adminCollectionFactory";
import type { LiveEnvelope } from "@/utils/liveStream";
import { createTestQueryClient } from "../utils/queryClient";

interface Row {
  id: string;
  label: string;
}

const QUERY_KEY = ["admin", "factory-test"] as const;

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function createRows(
  queryFn: () => Promise<Row[]> = async () => [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  syncMode?: "eager" | "on-demand",
) {
  const queryClient = createTestQueryClient();
  cleanups.push(() => queryClient.clear());
  return createAdminCollection<Row>({
    queryKey: QUERY_KEY,
    queryFn,
    queryClient,
    enabled: true,
    syncMode,
    getKey: (row) => row.id,
  });
}

type RowsCollection = ReturnType<typeof createRows>;

function createLifecycle() {
  return createAdminCollectionLifecycle<Row, RowsCollection>({ queryKey: QUERY_KEY });
}

function envelope(keys: string[][]): LiveEnvelope {
  return {
    topic: "seating",
    action: "updated",
    scope: { edition_id: null, event_id: null, registration_id: null, table_id: null },
    keys,
    ts: "2026-10-05T10:00:00Z",
    id: "evt",
  };
}

describe("createAdminCollection", () => {
  it("defaults to eager sync and loads every row", async () => {
    const queryFn = vi.fn(async () => [{ id: "a", label: "A" }]);
    const collection = createRows(queryFn);

    expect(collection.config.syncMode ?? "eager").toBe("eager");
    await collection.preload();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(collection.get("a")).toMatchObject({ id: "a", label: "A" });
  });

  it("passes the selected sync mode to the collection", () => {
    expect(createRows(undefined, "on-demand").config.syncMode).toBe("on-demand");
    expect(createRows(undefined, "eager").config.syncMode).toBe("eager");
  });
});

describe("numeric row keys", () => {
  it("supports collections keyed by a number (exhibitors)", async () => {
    const queryClient = createTestQueryClient();
    cleanups.push(() => queryClient.clear());
    const collection = createAdminCollection<{ id: number; name: string }, number>({
      queryKey: QUERY_KEY,
      queryFn: async () => [{ id: 7, name: "Seven" }],
      queryClient,
      enabled: true,
      getKey: (row) => row.id,
    });
    const lifecycle = createAdminCollectionLifecycle<
      { id: number; name: string },
      typeof collection,
      number
    >({ queryKey: QUERY_KEY });
    await collection.preload();

    await lifecycle.deleteIfPresent(collection, 99);
    await lifecycle.deleteIfPresent(collection, 7);

    expect(collection.has(7)).toBe(false);
  });
});

describe("createAdminCollectionLifecycle", () => {
  it("invalidates a captured fence on register, unregister and reset", async () => {
    const lifecycle = createLifecycle();
    const collection = createRows();
    await collection.preload();

    const beforeRegister = lifecycle.captureFence();
    const unregister = lifecycle.register(collection);
    expect(beforeRegister()).toBe(false);

    const beforeUnregister = lifecycle.captureFence();
    unregister();
    expect(beforeUnregister()).toBe(false);

    const beforeReset = lifecycle.captureFence();
    await lifecycle.reset(collection);
    expect(beforeReset()).toBe(false);
    expect(lifecycle.captureFence()()).toBe(true);
  });

  it("empties the collection on reset", async () => {
    const lifecycle = createLifecycle();
    const collection = createRows();
    await collection.preload();

    await lifecycle.reset(collection);

    expect(collection.size).toBe(0);
  });

  it("only deletes or replaces rows the collection holds", async () => {
    const lifecycle = createLifecycle();
    const collection = createRows();
    await collection.preload();

    await lifecycle.deleteIfPresent(collection, "missing");
    await lifecycle.upsertIfPresent(collection, "missing", (row) => row);
    expect(collection.has("missing")).toBe(false);

    await lifecycle.upsertIfPresent(collection, "a", (row) => ({ ...row, label: "A2" }));
    expect(collection.get("a")?.label).toBe("A2");
    await lifecycle.deleteIfPresent(collection, "a");
    expect(collection.has("a")).toBe(false);
  });

  it("writes to every active collection and rejects after all settled", async () => {
    const lifecycle = createLifecycle();
    const first = createRows();
    const second = createRows();
    await Promise.all([first.preload(), second.preload()]);
    cleanups.push(lifecycle.register(first), lifecycle.register(second));

    await lifecycle.writeToActive((collection) =>
      collection.utils.writeUpsert({ id: "c", label: "C" }),
    );
    expect(first.has("c")).toBe(true);
    expect(second.has("c")).toBe(true);

    const seen: RowsCollection[] = [];
    await expect(
      lifecycle.writeToActive(async (collection) => {
        seen.push(collection);
        if (collection === first) throw new Error("first failed");
      }),
    ).rejects.toThrow("first failed");
    expect(seen).toHaveLength(2);
  });

  it("reports whether a collection is registered", async () => {
    const lifecycle = createLifecycle();
    const collection = createRows();
    expect(lifecycle.hasActiveCollections()).toBe(false);

    const unregister = lifecycle.register(collection);
    expect(lifecycle.hasActiveCollections()).toBe(true);
    unregister();
    expect(lifecycle.hasActiveCollections()).toBe(false);
  });

  it("drops older live events per row id", () => {
    const lifecycle = createLifecycle();

    expect(lifecycle.claimEvent("a", 2000)).toBe(true);
    expect(lifecycle.claimEvent("a", 1000)).toBe(false);
    expect(lifecycle.claimEvent("b", 1000)).toBe(true);

    expect(lifecycle.claimEvent("a", 3000)).toBe(true);
    expect(lifecycle.isLatestEvent("a", 2000)).toBe(false);
    expect(lifecycle.isLatestEvent("a", 3000)).toBe(true);
  });

  it("matches only the exact query key", () => {
    const lifecycle = createLifecycle();

    expect(lifecycle.hasQueryKey(envelope([["admin", "factory-test"]]))).toBe(true);
    expect(lifecycle.hasQueryKey(envelope([["admin", "factory-test", "nested"]]))).toBe(false);
    expect(lifecycle.hasQueryKey(envelope([["admin", "other"]]))).toBe(false);
  });
});

import "fake-indexeddb/auto";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCacheStorage } from "./adminCacheStorage";
import {
  AdminCachePersistence,
  ADMIN_CACHE_BUSTER,
  ADMIN_CACHE_MAX_AGE,
  ADMIN_CACHE_WRITE_DELAY,
  isPersistableAdminKey,
} from "./adminCachePersistence";
import { queryKeys } from "@/utils/queryKeys";

const clients: QueryClient[] = [];
const controllers: AdminCachePersistence[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: ADMIN_CACHE_MAX_AGE } } });
  clients.push(client);
  const storage = new AdminCacheStorage();
  const cache = new AdminCachePersistence(client, storage);
  controllers.push(cache);
  return { client, storage, cache };
}
async function seed(
  storage: AdminCacheStorage,
  options: { timestamp?: number; buster?: string; owner?: string } = {},
) {
  const client = new QueryClient();
  client.setQueryData(queryKeys.admin.tables, [{ id: "table" }]);
  client.setQueryData(queryKeys.admin.registrationsEdition("edition"), [
    { id: "guest", checkInToken: "secret", person: { niss: "secret", eID: "secret" } },
  ]);
  await storage.write(
    {
      owner: options.owner ?? "user",
      editionId: "edition",
      client: {
        timestamp: options.timestamp ?? Date.now(),
        buster: options.buster ?? ADMIN_CACHE_BUSTER,
        clientState: dehydrate(client),
      },
    },
    () => true,
  );
  client.clear();
}
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, ADMIN_CACHE_WRITE_DELAY + 30));
}
beforeEach(async () => {
  await new AdminCacheStorage().remove();
});
afterEach(async () => {
  await Promise.all(controllers.splice(0).map((cache) => cache.wipe()));
  clients.splice(0).forEach((client) => client.clear());
});

describe("admin cache privacy boundary", () => {
  it("matches complete keys only", () => {
    for (const key of [
      queryKeys.admin.tables,
      queryKeys.admin.venues,
      queryKeys.admin.rooms,
      queryKeys.admin.tableTypes,
      queryKeys.admin.layouts,
      queryKeys.admin.areas,
      queryKeys.admin.exhibitors,
      queryKeys.admin.registrationsEdition("edition"),
    ]) {
      expect(isPersistableAdminKey(key, "edition")).toBe(true);
      expect(isPersistableAdminKey([...key, "extra"], "edition")).toBe(false);
    }
    for (const key of [
      queryKeys.admin.registrations,
      ["admin", "registrations", "page", 1],
      queryKeys.admin.eventCheckInStats,
      queryKeys.admin.people,
      queryKeys.admin.paymentTransactions("guest"),
      queryKeys.admin.registrationsEdition("other"),
    ]) {
      expect(isPersistableAdminKey(key, "edition")).toBe(false);
    }
  });
  it("restores the active edition and strips detail-only secrets", async () => {
    const { client, storage, cache } = setup();
    await seed(storage);
    await cache.setSession("user");
    expect(client.getQueryData(queryKeys.admin.tables)).toEqual([{ id: "table" }]);
    expect(client.getQueryData(queryKeys.admin.registrationsEdition("edition"))).toEqual([
      { id: "guest", person: {} },
    ]);
    expect(cache.getSnapshot()).toMatchObject({ editionId: "edition", restored: true });
  });
  it("stores only allowlisted queries, no mutations, pages, statistics or secrets", async () => {
    const { client, storage, cache } = setup();
    await cache.setSession("user");
    await cache.setEdition("edition");
    client.setQueryData(queryKeys.admin.registrationsEdition("edition"), [
      { id: "guest", checkInToken: "secret", person: { niss: "secret" } },
    ]);
    client.setQueryData(["admin", "registrations", "page", 1], [{ name: "private" }]);
    client.setQueryData(queryKeys.admin.eventCheckInStats, { count: 1 });
    client.setQueryData(queryKeys.admin.people, [{ email: "private" }]);
    await flush();
    const stored = await storage.read();
    expect(JSON.stringify(stored)).not.toMatch(/secret|private|checkin-stats|checkInToken|niss/);
    expect(stored).toMatchObject({
      client: {
        clientState: {
          mutations: [],
          queries: [{ queryKey: queryKeys.admin.registrationsEdition("edition") }],
        },
      },
    });
  });
  it.each(["unauthenticated start", "role loss", "sign-out"])(
    "wipes on %s without restoring",
    async () => {
      const { client, storage, cache } = setup();
      await seed(storage);
      await cache.setSession(null);
      expect(await storage.read()).toBeUndefined();
      expect(client.getQueryCache().getAll()).toHaveLength(0);
    },
  );
  it.each([
    { timestamp: Date.now() - ADMIN_CACHE_MAX_AGE - 1 },
    { buster: "old" },
    { owner: "other-user" },
  ])("discards expired, incompatible or other-account cache: %o", async (options) => {
    const { client, storage, cache } = setup();
    await seed(storage, options);
    await cache.setSession("user");
    expect(await storage.read()).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it("wipes on edition change and cannot restore the old edition", async () => {
    const { client, storage, cache } = setup();
    await seed(storage);
    await cache.setSession("user");
    await cache.setEdition("next");
    expect(await storage.read()).toBeUndefined();
    expect(client.getQueryData(queryKeys.admin.registrationsEdition("edition"))).toBeUndefined();
    client.setQueryData(queryKeys.admin.registrationsEdition("edition"), [{ id: "old" }]);
    client.setQueryData(queryKeys.admin.registrationsEdition("next"), [{ id: "new" }]);
    await flush();
    expect(JSON.stringify(await storage.read())).not.toContain('"old"');
  });
  it("fences a restore that resolves after sign-out", async () => {
    const { client, storage, cache } = setup();
    await seed(storage);
    const stored = await storage.read();
    let resolve!: (value: unknown) => void;
    vi.spyOn(storage, "read").mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const restore = cache.setSession("user");
    await cache.wipe();
    resolve(stored);
    await restore;
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(await new AdminCacheStorage().read()).toBeUndefined();
  });
  it("fences queued writes after a wipe", async () => {
    const { client, storage, cache } = setup();
    await cache.setSession("user");
    const original = storage.write.bind(storage);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(storage, "write").mockImplementation(async (value, current) => {
      await delayed;
      await original(value, current);
    });
    client.setQueryData(queryKeys.admin.tables, [{ id: "table" }]);
    await flush();
    await cache.wipe();
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await storage.read()).toBeUndefined();
  });
  it("falls back to memory when IndexedDB is unavailable", async () => {
    const { client, storage, cache } = setup();
    vi.spyOn(storage, "read").mockRejectedValue(new Error("private browsing"));
    vi.spyOn(storage, "write").mockRejectedValue(new Error("quota"));
    await expect(cache.setSession("user")).resolves.toBeUndefined();
    client.setQueryData(queryKeys.admin.tables, [{ id: "table" }]);
    await flush();
    expect(client.getQueryData(queryKeys.admin.tables)).toEqual([{ id: "table" }]);
  });
  it("removes a restored record when its retention timer expires", async () => {
    const { client, storage, cache } = setup();
    await seed(storage, { timestamp: Date.now() - ADMIN_CACHE_MAX_AGE + 150 });
    await cache.setSession("user");
    expect(client.getQueryData(queryKeys.admin.tables)).toBeTruthy();
    await vi.waitFor(async () => expect(await storage.read()).toBeUndefined());
    expect(client.getQueryData(queryKeys.admin.tables)).toBeUndefined();
  });
  it("batches successful updates before serializing", async () => {
    const { client, storage, cache } = setup();
    await cache.setSession("user");
    const write = vi.spyOn(storage, "write");
    for (let i = 0; i < 20; i++) client.setQueryData(queryKeys.admin.tables, [{ id: String(i) }]);
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await storage.read())).toContain('"19"');
  });
});

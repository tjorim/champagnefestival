import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import {
  canPatchAdminTableLiveEvent,
  createAdminTablesCollection,
  isTableRowUnaffectedByLiveEvent,
  patchAdminTableLiveEvent,
  refetchAdminTables,
  registerAdminTablesCollection,
  removeAdminTablesForLayouts,
  replaceAdminTablesForLayout,
  resetAdminTablesCollection,
} from "@/state/adminTablesCollection";
import { seedTables } from "@/mocks/data/venue";
import type { FloorTableRecord } from "@/types/admin";
import type { LiveEnvelope } from "@/utils/liveStream";
import { createTable, deleteTable } from "@/utils/adminFetch";
import { createTestQueryClient } from "../utils/queryClient";

const TEST_AUTH_HEADERS = { Authorization: "Bearer ".concat("mock-access-token") };
const authHeaders = () => TEST_AUTH_HEADERS;

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

async function createLoadedCollection() {
  const queryClient = createTestQueryClient();
  const collection = createAdminTablesCollection({ queryClient, authHeaders, enabled: true });
  cleanups.push(() => queryClient.clear());
  await collection.preload();
  return { collection, queryClient };
}

let eventTime = Date.parse("2026-10-05T10:00:00Z");

function seatingEnvelope(overrides: Partial<LiveEnvelope> = {}): LiveEnvelope {
  eventTime += 1000;
  return {
    topic: "seating",
    action: "updated",
    scope: { edition_id: null, event_id: null, registration_id: null, table_id: "table-01" },
    keys: [
      ["admin", "registrations"],
      ["admin", "tables"],
    ],
    ts: new Date(eventTime).toISOString(),
    id: "evt-seating",
    ...overrides,
  };
}

describe("admin tables collection", () => {
  it("loads the stored rows without occupancy", async () => {
    const { collection } = await createLoadedCollection();

    expect(collection.size).toBe(seedTables.length);
    const row = collection.get("table-01") as FloorTableRecord;
    expect(row).toMatchObject({ name: "T1", layoutId: "layout-01", tableTypeId: "tt-01" });
    expect(row).not.toHaveProperty("registrationIds");
  });

  it("applies an update optimistically, sends only the changed fields and refetches", async () => {
    const { collection } = await createLoadedCollection();
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.put("/api/tables/:id", async ({ request, params }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        const current = seedTables.find((t) => t.id === params.id)!;
        return HttpResponse.json({ ...current, ...bodies.at(-1) });
      }),
      http.get("/api/tables", () =>
        HttpResponse.json(
          seedTables.map((t) => (t.id === "table-01" ? { ...t, x: 61, y: 72 } : t)),
        ),
      ),
    );

    const tx = collection.update("table-01", (draft) => {
      draft.x = 61;
      draft.y = 72;
    });
    expect(collection.get("table-01")).toMatchObject({ x: 61, y: 72 });

    await tx.isPersisted.promise;

    expect(bodies).toEqual([{ x: 61, y: 72 }]);
    expect(collection.get("table-01")).toMatchObject({ x: 61, y: 72 });
  });

  it("maps renames and type changes to the API field names", async () => {
    const { collection } = await createLoadedCollection();
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.put("/api/tables/:id", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(seedTables[0]);
      }),
    );

    await collection.update("table-01", (draft) => {
      draft.name = "Renamed";
    }).isPersisted.promise;
    await collection.update("table-01", (draft) => {
      draft.tableTypeId = "tt-02";
    }).isPersisted.promise;
    await collection.update("table-01", (draft) => {
      draft.rotation = 90;
    }).isPersisted.promise;

    expect(bodies).toEqual([{ name: "Renamed" }, { table_type_id: "tt-02" }, { rotation: 90 }]);
  });

  it("rolls the optimistic update back when the server rejects it", async () => {
    const { collection } = await createLoadedCollection();
    server.use(
      http.put("/api/tables/:id", () => HttpResponse.json({ detail: "nope" }, { status: 500 })),
    );

    const tx = collection.update("table-01", (draft) => {
      draft.x = 99;
    });
    expect(collection.get("table-01")?.x).toBe(99);

    await expect(tx.isPersisted.promise).rejects.toThrow();
    expect(collection.get("table-01")?.x).toBe(seedTables[0]!.x);
  });

  it("creates a table through the API and upserts the server's row", async () => {
    const { collection } = await createLoadedCollection();

    const created = await createTable(authHeaders, {
      name: "T9",
      layoutId: "layout-01",
      tableTypeId: "tt-01",
    });
    await collection.utils.writeUpsert(created);

    expect(collection.get(created.id)).toMatchObject({ name: "T9", capacity: 6 });
    expect(collection.size).toBe(seedTables.length + 1);
  });

  it("deletes a table through the API and removes the row", async () => {
    const { collection } = await createLoadedCollection();

    await deleteTable(authHeaders, "table-02");
    await collection.utils.writeDelete("table-02");

    expect(collection.has("table-02")).toBe(false);
  });

  it("removes the tables of deleted layouts and replaces a restored layout's tables", async () => {
    const { collection } = await createLoadedCollection();
    const layoutIds = new Set(seedTables.map((t) => t.layout_id));
    const [layoutId] = [...layoutIds];
    const inLayout = seedTables.filter((t) => t.layout_id === layoutId);

    const restored: FloorTableRecord = {
      id: "table-restored",
      name: "Restored",
      capacity: 6,
      x: 5,
      y: 5,
      tableTypeId: "tt-01",
      rotation: 0,
      layoutId: layoutId as string,
    };
    await replaceAdminTablesForLayout(collection, layoutId as string, [restored]);
    expect(collection.has("table-restored")).toBe(true);
    for (const table of inLayout) expect(collection.has(table.id)).toBe(false);

    await removeAdminTablesForLayouts(collection, [layoutId as string]);
    expect(collection.has("table-restored")).toBe(false);
    expect(collection.size).toBe(seedTables.length - inLayout.length);
  });

  it("refetches the server state on demand", async () => {
    const { collection } = await createLoadedCollection();
    server.use(http.get("/api/tables", () => HttpResponse.json(seedTables.slice(0, 1))));

    await refetchAdminTables(collection);

    expect(collection.size).toBe(1);
  });

  it("resets to empty", async () => {
    const { collection } = await createLoadedCollection();

    await resetAdminTablesCollection(collection);

    expect(collection.size).toBe(0);
  });
});

describe("admin tables live events", () => {
  it("only patches table-scoped seating events while a collection is active", async () => {
    const { collection } = await createLoadedCollection();
    expect(canPatchAdminTableLiveEvent(seatingEnvelope())).toBe(false);

    cleanups.push(registerAdminTablesCollection(collection));
    expect(canPatchAdminTableLiveEvent(seatingEnvelope())).toBe(true);
    expect(
      canPatchAdminTableLiveEvent(seatingEnvelope({ keys: [["admin", "registrations"]] })),
    ).toBe(false);
    expect(
      canPatchAdminTableLiveEvent(
        seatingEnvelope({
          scope: { edition_id: null, event_id: null, registration_id: null, table_id: null },
        }),
      ),
    ).toBe(false);
    expect(canPatchAdminTableLiveEvent(seatingEnvelope({ topic: "registration" }))).toBe(false);
  });

  it("treats registration-scoped seating events as not touching any table row", () => {
    const allocation = seatingEnvelope({
      scope: { edition_id: null, event_id: null, registration_id: "reg-01", table_id: "table-01" },
    });
    expect(isTableRowUnaffectedByLiveEvent(allocation)).toBe(true);
    expect(isTableRowUnaffectedByLiveEvent(seatingEnvelope())).toBe(false);
  });

  it("upserts an updated or created table from the server", async () => {
    const { collection } = await createLoadedCollection();
    cleanups.push(registerAdminTablesCollection(collection));
    server.use(
      http.get("/api/tables/:id", () =>
        HttpResponse.json({ ...seedTables[0], name: "Renamed elsewhere" }),
      ),
    );

    await patchAdminTableLiveEvent(seatingEnvelope(), authHeaders);

    expect(collection.get("table-01")?.name).toBe("Renamed elsewhere");
    expect(collection.size).toBe(seedTables.length);
  });

  it("removes a deleted table without fetching it", async () => {
    const { collection } = await createLoadedCollection();
    cleanups.push(registerAdminTablesCollection(collection));
    let fetched = false;
    server.use(
      http.get("/api/tables/:id", () => {
        fetched = true;
        return HttpResponse.json(null, { status: 404 });
      }),
    );

    await patchAdminTableLiveEvent(seatingEnvelope({ action: "deleted" }), authHeaders);

    expect(collection.has("table-01")).toBe(false);
    expect(fetched).toBe(false);
  });

  it("drops an event older than the newest one already applied", async () => {
    const { collection } = await createLoadedCollection();
    cleanups.push(registerAdminTablesCollection(collection));
    server.use(
      http.get("/api/tables/:id", () => HttpResponse.json({ ...seedTables[0], name: "Newest" })),
    );
    const newest = seatingEnvelope();
    const stale = seatingEnvelope({ ts: new Date(Date.parse(newest.ts) - 5000).toISOString() });

    await patchAdminTableLiveEvent(newest, authHeaders);
    server.use(
      http.get("/api/tables/:id", () => HttpResponse.json({ ...seedTables[0], name: "Stale" })),
    );
    await patchAdminTableLiveEvent(stale, authHeaders);

    expect(collection.get("table-01")?.name).toBe("Newest");
  });

  it("discards a fetched row when the collection is reset while the fetch is in flight", async () => {
    const { collection } = await createLoadedCollection();
    cleanups.push(registerAdminTablesCollection(collection));
    let respond: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      respond = resolve;
    });
    server.use(
      http.get("/api/tables/:id", async () => {
        await gate;
        return HttpResponse.json({ ...seedTables[0], name: "Late response" });
      }),
    );

    const patch = patchAdminTableLiveEvent(seatingEnvelope(), authHeaders);
    await resetAdminTablesCollection(collection);
    expect(collection.size).toBe(0);

    respond();
    await patch;

    expect(collection.size).toBe(0);
  });

  it("discards a fetched row when its collection unregisters while the fetch is in flight", async () => {
    const { collection } = await createLoadedCollection();
    const unregister = registerAdminTablesCollection(collection);
    let respond: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      respond = resolve;
    });
    server.use(
      http.get("/api/tables/:id", async () => {
        await gate;
        return HttpResponse.json({ ...seedTables[0], name: "Late response" });
      }),
    );

    const patch = patchAdminTableLiveEvent(seatingEnvelope(), authHeaders);
    unregister();
    respond();
    await patch;

    expect(collection.get("table-01")?.name).toBe("T1");
  });

  it("rejects events that cannot be applied incrementally", async () => {
    await expect(patchAdminTableLiveEvent(seatingEnvelope(), authHeaders)).rejects.toThrow(
      "cannot be applied incrementally",
    );
  });
});

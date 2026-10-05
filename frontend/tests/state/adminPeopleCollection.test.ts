import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { seedPeople } from "@/mocks/data/people";
import {
  applyAdminPeopleMerged,
  applyAdminPersonCreated,
  applyAdminPersonDeleted,
  applyAdminPersonUpdated,
  applyAdminVolunteerDeleted,
  applyAdminVolunteerUpdated,
  captureAdminPeopleFence,
  createAdminPeopleCollection,
  invalidateAdminPersonDetailQueries,
  refetchAdminPeople,
  registerAdminPeopleCollection,
  resetAdminPeopleCollection,
  selectMembers,
  selectVolunteers,
} from "@/state/adminPeopleCollection";
import { apiToPerson, type Person } from "@/types/person";
import { createTestQueryClient } from "../utils/queryClient";

const TEST_AUTH_HEADERS = { Authorization: "Bearer ".concat("mock-access-token") };
const authHeaders = () => TEST_AUTH_HEADERS;
const always = () => true;

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

async function createLoadedCollection() {
  const queryClient = createTestQueryClient();
  const collection = createAdminPeopleCollection({ queryClient, authHeaders, enabled: true });
  cleanups.push(() => queryClient.clear());
  await collection.preload();
  return { collection, queryClient };
}

function person(overrides: Partial<Person> & { id: string }): Person {
  return {
    ...apiToPerson({ ...seedPeople[1]!, id: overrides.id }),
    helpPeriods: [],
    ...overrides,
  };
}

const memberIds = (collection: Awaited<ReturnType<typeof createLoadedCollection>>["collection"]) =>
  selectMembers(collection.toArray).map((member) => member.id);

describe("admin people collection", () => {
  it("loads people with volunteers merged in", async () => {
    const { collection } = await createLoadedCollection();

    expect(collection.size).toBe(seedPeople.length);
    expect(collection.get("person-01")?.roles).toContain("volunteer");
    expect(collection.get("person-02")).toMatchObject({ name: "Bernard Martin" });
  });

  it("derives members from the people rows instead of storing them twice", async () => {
    const { collection } = await createLoadedCollection();

    expect(memberIds(collection)).toEqual(
      seedPeople.filter((p) => (p.roles as string[]).includes("member")).map((p) => p.id),
    );
  });

  it("derives volunteers from the people rows the same way", async () => {
    const { collection } = await createLoadedCollection();

    expect(selectVolunteers(collection.toArray).map((p) => p.id)).toEqual(
      seedPeople.filter((p) => (p.roles as string[]).includes("volunteer")).map((p) => p.id),
    );

    await applyAdminVolunteerDeleted(collection, "person-01", always);
    expect(selectVolunteers(collection.toArray).map((p) => p.id)).not.toContain("person-01");
    expect(selectMembers(collection.toArray).map((p) => p.id)).toContain("person-01");
  });

  it("refetches the collection explicitly", async () => {
    const { collection } = await createLoadedCollection();
    let requests = 0;
    server.use(
      http.get("/api/people", () => {
        requests += 1;
        return HttpResponse.json({ items: [], total: 0, limit: 1000, page: 1 });
      }),
    );

    await refetchAdminPeople(collection);

    expect(requests).toBe(1);
    // Only the volunteer-only rows survive an empty people response.
    expect(collection.has("person-02")).toBe(false);
  });

  it("shows a created person as a member only when they hold the member role", async () => {
    const { collection } = await createLoadedCollection();

    await applyAdminPersonCreated(
      collection,
      person({ id: "new-member", roles: ["member"] }),
      always,
    );
    await applyAdminPersonCreated(collection, person({ id: "new-guest", roles: [] }), always);

    expect(collection.has("new-guest")).toBe(true);
    expect(memberIds(collection)).toContain("new-member");
    expect(memberIds(collection)).not.toContain("new-guest");
  });

  it("updates one person once and the members view follows, including a role change", async () => {
    const { collection } = await createLoadedCollection();
    const before = collection.get("person-02")!;

    await applyAdminPersonUpdated(collection, { ...before, name: "Bernard M." }, always);
    expect(collection.get("person-02")?.name).toBe("Bernard M.");
    expect(selectMembers(collection.toArray).find((m) => m.id === "person-02")?.name).toBe(
      "Bernard M.",
    );

    await applyAdminPersonUpdated(collection, { ...before, roles: ["guest"] }, always);
    expect(memberIds(collection)).not.toContain("person-02");
  });

  it("does not invent a row for an update of a person the collection does not hold", async () => {
    const { collection } = await createLoadedCollection();

    await applyAdminPersonUpdated(collection, person({ id: "unknown" }), always);

    expect(collection.has("unknown")).toBe(false);
  });

  it("keeps a volunteer's help periods when a person update carries none", async () => {
    const { collection } = await createLoadedCollection();
    const helpPeriods = [{ id: 7, firstHelpDay: "2026-10-10", lastHelpDay: null, notes: "" }];
    await applyAdminVolunteerUpdated(
      collection,
      person({ id: "person-01", roles: ["member", "volunteer"], helpPeriods }),
      always,
    );

    await applyAdminPersonUpdated(
      collection,
      person({ id: "person-01", roles: ["member", "volunteer"], name: "Renamed", helpPeriods: [] }),
      always,
    );

    expect(collection.get("person-01")).toMatchObject({ name: "Renamed", helpPeriods });
  });

  it("deletes a person (and so the member) and tolerates a row that is already gone", async () => {
    const { collection } = await createLoadedCollection();

    await applyAdminPersonDeleted(collection, "person-02", always);
    expect(collection.has("person-02")).toBe(false);
    expect(memberIds(collection)).not.toContain("person-02");

    await expect(applyAdminPersonDeleted(collection, "person-02", always)).resolves.toBeUndefined();
  });

  it("patches a volunteer update onto the person and removes the volunteer role", async () => {
    const { collection } = await createLoadedCollection();
    const volunteer = collection.get("person-01")!;

    await applyAdminVolunteerUpdated(
      collection,
      { ...volunteer, name: "Alice D.", active: false },
      always,
    );
    expect(selectMembers(collection.toArray).find((m) => m.id === "person-01")).toMatchObject({
      name: "Alice D.",
      active: false,
    });

    await applyAdminVolunteerDeleted(collection, "person-01", always);
    expect(collection.get("person-01")?.roles).not.toContain("volunteer");
    expect(collection.get("person-01")?.helpPeriods).toEqual([]);
    expect(memberIds(collection)).toContain("person-01");
  });

  it("merges two people: the duplicate disappears and the survivor keeps its own help periods", async () => {
    const { collection } = await createLoadedCollection();
    const survivor = person({ id: "person-01", roles: ["member", "volunteer"], name: "Merged" });
    const survivorPeriods = collection.get("person-01")!.helpPeriods;

    await applyAdminPeopleMerged(collection, survivor, "person-02", always);

    expect(collection.has("person-02")).toBe(false);
    expect(memberIds(collection)).not.toContain("person-02");
    expect(collection.get("person-01")).toMatchObject({
      name: "Merged",
      helpPeriods: survivorPeriods,
    });
  });

  it("does not report a failed action when a local write cannot be applied", async () => {
    const { collection } = await createLoadedCollection();
    vi.spyOn(collection.utils, "writeUpsert").mockRejectedValue(new Error("sync stopped"));

    await expect(
      applyAdminPersonCreated(collection, person({ id: "late", roles: ["member"] }), always),
    ).resolves.toBeUndefined();
  });

  describe("cancellation of in-flight writes", () => {
    it("drops a response that arrives after the session was reset", async () => {
      const { collection } = await createLoadedCollection();
      const isCurrent = captureAdminPeopleFence();

      await resetAdminPeopleCollection(collection);
      await applyAdminPersonCreated(
        collection,
        person({ id: "late", roles: ["member"] }),
        isCurrent,
      );
      await applyAdminPersonUpdated(
        collection,
        person({ id: "person-02", name: "Late" }),
        isCurrent,
      );

      expect(collection.size).toBe(0);
    });

    it("drops a response that arrives after the collection was swapped", async () => {
      const { collection } = await createLoadedCollection();
      const unregister = registerAdminPeopleCollection();
      const isCurrent = captureAdminPeopleFence();

      unregister();
      await applyAdminPersonDeleted(collection, "person-02", isCurrent);

      expect(collection.has("person-02")).toBe(true);
    });

    it("applies a response that belongs to the current session", async () => {
      const { collection } = await createLoadedCollection();
      const isCurrent = captureAdminPeopleFence();

      await applyAdminPersonDeleted(collection, "person-02", isCurrent);

      expect(collection.has("person-02")).toBe(false);
    });
  });

  describe("reset", () => {
    it("empties the collection, and with it the members view", async () => {
      const { collection } = await createLoadedCollection();
      expect(collection.size).toBeGreaterThan(0);

      await resetAdminPeopleCollection(collection);

      expect(collection.size).toBe(0);
      expect(memberIds(collection)).toEqual([]);
    });

    it("is safe on a collection that is already empty", async () => {
      const { collection } = await createLoadedCollection();
      await resetAdminPeopleCollection(collection);

      await expect(resetAdminPeopleCollection(collection)).resolves.toBeUndefined();
    });
  });

  it("invalidates only the per-person queries nested under the people key", async () => {
    const { collection, queryClient } = await createLoadedCollection();
    const detailKey = ["admin", "people", "person-02", "registrations"] as const;
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    queryClient.setQueryData(detailKey, [{ id: "reg-1" }]);
    queryClient.setQueryData(["admin", "people"], [...collection.values()]);

    await invalidateAdminPersonDetailQueries(queryClient);

    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["admin", "people"])?.isInvalidated).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { seedPeople } from "@/mocks/data/people";
import {
  applyAdminMemberCreated,
  applyAdminPeopleMerged,
  applyAdminPersonCreated,
  applyAdminPersonDeleted,
  applyAdminPersonUpdated,
  applyAdminVolunteerDeleted,
  applyAdminVolunteerUpdated,
  captureAdminPeopleFence,
  createAdminPeopleCollections,
  invalidateAdminPersonDetailQueries,
  refetchAdminPeople,
  registerAdminPeopleCollections,
  resetAdminPeopleCollections,
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

async function createLoadedCollections() {
  const queryClient = createTestQueryClient();
  const collections = createAdminPeopleCollections({ queryClient, authHeaders, enabled: true });
  cleanups.push(() => queryClient.clear());
  await Promise.all([collections.people.preload(), collections.members.preload()]);
  return { collections, queryClient };
}

function person(overrides: Partial<Person> & { id: string }): Person {
  return {
    ...apiToPerson({ ...seedPeople[1]!, id: overrides.id }),
    helpPeriods: [],
    ...overrides,
  };
}

const memberIds = (
  collections: Awaited<ReturnType<typeof createLoadedCollections>>["collections"],
) => collections.members.toArray.map((member) => member.id);

describe("admin people collections", () => {
  it("loads people (with volunteers merged in) and members from their own endpoints", async () => {
    const { collections } = await createLoadedCollections();

    expect(collections.people.size).toBe(seedPeople.length);
    expect(collections.people.get("person-01")?.roles).toContain("volunteer");
    expect(collections.members.size).toBe(
      seedPeople.filter((p) => (p.roles as string[]).includes("member")).length,
    );
    expect(collections.members.get("person-02")).toMatchObject({ name: "Bernard Martin" });
  });

  it("refetches the requested collections explicitly", async () => {
    const { collections } = await createLoadedCollections();
    let peopleRequests = 0;
    server.use(
      http.get("/api/people", ({ request }) => {
        if (new URL(request.url).searchParams.get("role") !== "member") peopleRequests += 1;
        return HttpResponse.json({ items: [], total: 0, limit: 1000, page: 1 });
      }),
    );

    await refetchAdminPeople(collections, ["people"]);

    expect(peopleRequests).toBe(1);
    // Only the volunteer-only rows survive the empty people response, and the
    // members collection was not asked to refetch.
    expect(collections.people.has("person-02")).toBe(false);
    expect(collections.members.has("person-02")).toBe(true);
  });

  it("creates a person, adding a member only when the person has the member role", async () => {
    const { collections } = await createLoadedCollections();

    await applyAdminPersonCreated(
      collections,
      person({ id: "new-member", roles: ["member"] }),
      always,
    );
    await applyAdminPersonCreated(collections, person({ id: "new-guest", roles: [] }), always);

    expect(collections.people.has("new-member")).toBe(true);
    expect(collections.people.has("new-guest")).toBe(true);
    expect(collections.members.has("new-member")).toBe(true);
    expect(collections.members.has("new-guest")).toBe(false);
  });

  it("creates a member in both collections", async () => {
    const { collections } = await createLoadedCollections();

    await applyAdminMemberCreated(
      collections,
      person({ id: "member-x", roles: ["member"] }),
      always,
    );

    expect(collections.people.has("member-x")).toBe(true);
    expect(collections.members.has("member-x")).toBe(true);
  });

  it("updates one person into every collection and follows a role change", async () => {
    const { collections } = await createLoadedCollections();
    const before = collections.people.get("person-02")!;

    await applyAdminPersonUpdated(collections, { ...before, name: "Bernard M." }, always);
    expect(collections.people.get("person-02")?.name).toBe("Bernard M.");
    expect(collections.members.get("person-02")?.name).toBe("Bernard M.");

    await applyAdminPersonUpdated(collections, { ...before, roles: ["guest"] }, always);
    expect(collections.people.get("person-02")?.roles).toEqual(["guest"]);
    expect(collections.members.has("person-02")).toBe(false);
  });

  it("keeps a volunteer's help periods when a person update carries none", async () => {
    const { collections } = await createLoadedCollections();
    const helpPeriods = [{ id: 7, firstHelpDay: "2026-10-10", lastHelpDay: null, notes: "" }];
    await applyAdminVolunteerUpdated(
      collections,
      person({ id: "person-01", roles: ["member", "volunteer"], helpPeriods }),
      always,
    );

    await applyAdminPersonUpdated(
      collections,
      person({ id: "person-01", roles: ["member", "volunteer"], name: "Renamed", helpPeriods: [] }),
      always,
    );

    expect(collections.people.get("person-01")).toMatchObject({ name: "Renamed", helpPeriods });
  });

  it("deletes a person from every collection and tolerates a row that is already gone", async () => {
    const { collections } = await createLoadedCollections();

    await applyAdminPersonDeleted(collections, "person-02", always);
    expect(collections.people.has("person-02")).toBe(false);
    expect(collections.members.has("person-02")).toBe(false);

    await expect(
      applyAdminPersonDeleted(collections, "person-02", always),
    ).resolves.toBeUndefined();
  });

  it("patches a volunteer update onto the matching member and removes the volunteer role", async () => {
    const { collections } = await createLoadedCollections();
    const volunteer = collections.people.get("person-01")!;

    await applyAdminVolunteerUpdated(
      collections,
      { ...volunteer, name: "Alice D.", active: false },
      always,
    );
    expect(collections.members.get("person-01")).toMatchObject({ name: "Alice D.", active: false });

    await applyAdminVolunteerDeleted(collections, "person-01", always);
    expect(collections.people.get("person-01")?.roles).not.toContain("volunteer");
    expect(collections.people.get("person-01")?.helpPeriods).toEqual([]);
    expect(collections.members.has("person-01")).toBe(true);
  });

  it("merges two people: the duplicate disappears and the survivor keeps its own help periods", async () => {
    const { collections } = await createLoadedCollections();
    const survivor = person({ id: "person-01", roles: ["member", "volunteer"], name: "Merged" });
    const survivorPeriods = collections.people.get("person-01")!.helpPeriods;

    await applyAdminPeopleMerged(collections, survivor, "person-02", always);

    expect(collections.people.has("person-02")).toBe(false);
    expect(collections.members.has("person-02")).toBe(false);
    expect(collections.people.get("person-01")).toMatchObject({
      name: "Merged",
      helpPeriods: survivorPeriods,
    });
    expect(collections.members.get("person-01")?.name).toBe("Merged");
  });

  it("does not report a failed action when a local write cannot be applied", async () => {
    const { collections } = await createLoadedCollections();
    vi.spyOn(collections.people.utils, "writeUpsert").mockRejectedValue(new Error("sync stopped"));

    await expect(
      applyAdminPersonCreated(collections, person({ id: "late", roles: ["member"] }), always),
    ).resolves.toBeUndefined();
  });

  describe("cancellation of in-flight writes", () => {
    it("drops a response that arrives after the session was reset", async () => {
      const { collections } = await createLoadedCollections();
      const isCurrent = captureAdminPeopleFence();

      await resetAdminPeopleCollections(collections);
      await applyAdminPersonCreated(
        collections,
        person({ id: "late", roles: ["member"] }),
        isCurrent,
      );
      await applyAdminPersonUpdated(
        collections,
        person({ id: "person-02", name: "Late" }),
        isCurrent,
      );

      expect(collections.people.size).toBe(0);
      expect(collections.members.size).toBe(0);
    });

    it("drops a response that arrives after the collections were swapped", async () => {
      const { collections } = await createLoadedCollections();
      const unregister = registerAdminPeopleCollections();
      const isCurrent = captureAdminPeopleFence();

      unregister();
      await applyAdminPersonDeleted(collections, "person-02", isCurrent);

      expect(collections.people.has("person-02")).toBe(true);
      expect(collections.members.has("person-02")).toBe(true);
    });

    it("applies a response that belongs to the current session", async () => {
      const { collections } = await createLoadedCollections();
      const isCurrent = captureAdminPeopleFence();

      await applyAdminPersonDeleted(collections, "person-02", isCurrent);

      expect(collections.people.has("person-02")).toBe(false);
    });
  });

  describe("reset", () => {
    it("empties both collections", async () => {
      const { collections } = await createLoadedCollections();
      expect(collections.people.size).toBeGreaterThan(0);

      await resetAdminPeopleCollections(collections);

      expect(collections.people.size).toBe(0);
      expect(collections.members.size).toBe(0);
      expect(memberIds(collections)).toEqual([]);
    });

    it("is safe on collections that are already empty", async () => {
      const { collections } = await createLoadedCollections();
      await resetAdminPeopleCollections(collections);

      await expect(resetAdminPeopleCollections(collections)).resolves.toBeUndefined();
    });
  });

  it("invalidates only the per-person queries nested under the people key", async () => {
    const { collections, queryClient } = await createLoadedCollections();
    const detailKey = ["admin", "people", "person-02", "registrations"] as const;
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    queryClient.setQueryData(detailKey, [{ id: "reg-1" }]);
    queryClient.setQueryData(["admin", "people"], [...collections.people.values()]);

    await invalidateAdminPersonDetailQueries(queryClient);

    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["admin", "people"])?.isInvalidated).toBe(false);
  });
});

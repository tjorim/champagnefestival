import { describe, expect, it, vi } from "vitest";
import {
  applyAdminExhibitorContactsMerged,
  applyAdminExhibitorDeleted,
  applyAdminExhibitorSaved,
  captureAdminExhibitorsFence,
  createAdminExhibitorsCollection,
  refetchAdminExhibitors,
  registerAdminExhibitorsCollection,
  resetAdminExhibitorsCollection,
} from "@/state/adminExhibitorsCollection";
import { createTestQueryClient } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer test" });

async function setup() {
  const collection = createAdminExhibitorsCollection({
    queryClient: createTestQueryClient(),
    authHeaders,
    enabled: false,
  });
  const unregister = registerAdminExhibitorsCollection(collection);
  await collection.utils.writeUpsert([
    { id: 1, name: "One", active: true, contactPersonId: "dup" },
    { id: 2, name: "Two", active: true, contactPersonId: "other" },
    { id: 3, name: "Three", active: false, contactPersonId: "dup" },
  ]);
  return { collection, unregister };
}

describe("admin exhibitors collection", () => {
  it("is keyed by the numeric exhibitor id", async () => {
    const { collection, unregister } = await setup();

    expect(collection.get(2)?.name).toBe("Two");
    expect(collection.has(4)).toBe(false);
    unregister();
  });

  it("inserts a created exhibitor and replaces an edited one with defaults for missing fields", async () => {
    const { collection, unregister } = await setup();

    await applyAdminExhibitorSaved(
      collection,
      { id: 4, name: "Four" },
      captureAdminExhibitorsFence(),
    );
    await applyAdminExhibitorSaved(
      collection,
      { id: 1, name: "One edited", active: false, contactPersonId: null },
      captureAdminExhibitorsFence(),
    );

    expect(collection.get(4)).toMatchObject({
      id: 4,
      name: "Four",
      active: true,
      contactPersonId: null,
    });
    expect(collection.get(1)).toMatchObject({
      id: 1,
      name: "One edited",
      active: false,
      contactPersonId: null,
    });
    unregister();
  });

  it("removes a deleted exhibitor and ignores one it no longer holds", async () => {
    const { collection, unregister } = await setup();
    const isCurrent = captureAdminExhibitorsFence();

    await applyAdminExhibitorDeleted(collection, 2, isCurrent);
    await applyAdminExhibitorDeleted(collection, 2, isCurrent);

    expect(Array.from(collection.keys())).toEqual([1, 3]);
    unregister();
  });

  it("repoints only the duplicate's contacts on a people merge", async () => {
    const { collection, unregister } = await setup();

    await applyAdminExhibitorContactsMerged(
      collection,
      "dup",
      "canonical",
      captureAdminExhibitorsFence(),
    );

    expect(collection.get(1)?.contactPersonId).toBe("canonical");
    expect(collection.get(2)?.contactPersonId).toBe("other");
    expect(collection.get(3)?.contactPersonId).toBe("canonical");
    expect(collection.get(3)?.active).toBe(false);
    unregister();
  });

  it("drops every write captured before a reset", async () => {
    const { collection, unregister } = await setup();
    const isCurrent = captureAdminExhibitorsFence();

    await resetAdminExhibitorsCollection(collection);
    expect(collection.size).toBe(0);

    await applyAdminExhibitorSaved(collection, { id: 9, name: "Late" }, isCurrent);
    await applyAdminExhibitorContactsMerged(collection, "dup", "canonical", isCurrent);
    await applyAdminExhibitorDeleted(collection, 1, isCurrent);

    expect(collection.size).toBe(0);
    unregister();
  });

  it("skips a refetch that follows a write from an earlier session", async () => {
    const { collection, unregister } = await setup();
    const refetch = vi.spyOn(collection.utils, "refetch").mockResolvedValue([]);
    const isCurrent = captureAdminExhibitorsFence();

    await refetchAdminExhibitors(collection, isCurrent);
    expect(refetch).toHaveBeenCalledTimes(1);

    await resetAdminExhibitorsCollection(collection);
    await refetchAdminExhibitors(collection, isCurrent);
    expect(refetch).toHaveBeenCalledTimes(1);
    unregister();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  applyAdminOrganizationContactsMerged,
  applyAdminOrganizationDeleted,
  applyAdminOrganizationSaved,
  captureAdminOrganizationsFence,
  createAdminOrganizationsCollection,
  refetchAdminOrganizations,
  registerAdminOrganizationsCollection,
  resetAdminOrganizationsCollection,
} from "@/state/adminOrganizationsCollection";
import { createTestQueryClient } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer test" });

async function setup() {
  const collection = createAdminOrganizationsCollection({
    queryClient: createTestQueryClient(),
    authHeaders,
    enabled: false,
  });
  const unregister = registerAdminOrganizationsCollection(collection);
  await collection.utils.writeUpsert([
    { id: 1, name: "One", active: true, contactPersonId: "dup" },
    { id: 2, name: "Two", active: true, contactPersonId: "other" },
    { id: 3, name: "Three", active: false, contactPersonId: "dup" },
  ]);
  return { collection, unregister };
}

describe("admin organizations collection", () => {
  it("is keyed by the numeric organization id", async () => {
    const { collection, unregister } = await setup();

    expect(collection.get(2)?.name).toBe("Two");
    expect(collection.has(4)).toBe(false);
    unregister();
  });

  it("inserts a created organization and replaces an edited one with defaults for missing fields", async () => {
    const { collection, unregister } = await setup();

    await applyAdminOrganizationSaved(
      collection,
      { id: 4, name: "Four" },
      captureAdminOrganizationsFence(),
    );
    await applyAdminOrganizationSaved(
      collection,
      { id: 1, name: "One edited", active: false, contactPersonId: null },
      captureAdminOrganizationsFence(),
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

  it("removes a deleted organization and ignores one it no longer holds", async () => {
    const { collection, unregister } = await setup();
    const isCurrent = captureAdminOrganizationsFence();

    await applyAdminOrganizationDeleted(collection, 2, isCurrent);
    await applyAdminOrganizationDeleted(collection, 2, isCurrent);

    expect(Array.from(collection.keys())).toEqual([1, 3]);
    unregister();
  });

  it("repoints only the duplicate's contacts on a people merge", async () => {
    const { collection, unregister } = await setup();

    await applyAdminOrganizationContactsMerged(
      collection,
      "dup",
      "canonical",
      captureAdminOrganizationsFence(),
    );

    expect(collection.get(1)?.contactPersonId).toBe("canonical");
    expect(collection.get(2)?.contactPersonId).toBe("other");
    expect(collection.get(3)?.contactPersonId).toBe("canonical");
    expect(collection.get(3)?.active).toBe(false);
    unregister();
  });

  it("drops every write captured before a reset", async () => {
    const { collection, unregister } = await setup();
    const isCurrent = captureAdminOrganizationsFence();

    await resetAdminOrganizationsCollection(collection);
    expect(collection.size).toBe(0);

    await applyAdminOrganizationSaved(collection, { id: 9, name: "Late" }, isCurrent);
    await applyAdminOrganizationContactsMerged(collection, "dup", "canonical", isCurrent);
    await applyAdminOrganizationDeleted(collection, 1, isCurrent);

    expect(collection.size).toBe(0);
    unregister();
  });

  it("skips a refetch that follows a write from an earlier session", async () => {
    const { collection, unregister } = await setup();
    const refetch = vi.spyOn(collection.utils, "refetch").mockResolvedValue([]);
    const isCurrent = captureAdminOrganizationsFence();

    await refetchAdminOrganizations(collection, isCurrent);
    expect(refetch).toHaveBeenCalledTimes(1);

    await resetAdminOrganizationsCollection(collection);
    await refetchAdminOrganizations(collection, isCurrent);
    expect(refetch).toHaveBeenCalledTimes(1);
    unregister();
  });
});

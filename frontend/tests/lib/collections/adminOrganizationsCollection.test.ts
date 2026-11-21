import { seedOrganizations } from "@/mocks/data/organizations";
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
} from "@/lib/collections/adminOrganizationsCollection";
import { createTestQueryClient } from "../../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer test" });

async function setup() {
  const collection = createAdminOrganizationsCollection({
    queryClient: createTestQueryClient(),
    authHeaders,
    enabled: false,
  });
  const unregister = registerAdminOrganizationsCollection(collection);
  await collection.utils.writeUpsert([
    { id: 1, name: "One", active: true, contact_person_id: "dup" },
    { id: 2, name: "Two", active: true, contact_person_id: "other" },
    { id: 3, name: "Three", active: false, contact_person_id: "dup" },
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

  it("inserts and replaces complete API records without dropping their metadata", async () => {
    const { collection, unregister } = await setup();

    await applyAdminOrganizationSaved(
      collection,
      { ...seedOrganizations[2]!, id: 4, name: "Four" },
      captureAdminOrganizationsFence(),
    );
    await applyAdminOrganizationSaved(
      collection,
      {
        ...seedOrganizations[2]!,
        id: 1,
        name: "One edited",
        active: false,
        contact_person_id: null,
      },
      captureAdminOrganizationsFence(),
    );

    expect(collection.get(4)).toMatchObject({
      id: 4,
      name: "Four",
      active: true,
      contact_person_id: null,
    });
    expect(collection.get(1)).toMatchObject({
      id: 1,
      name: "One edited",
      active: false,
      contact_person_id: null,
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

    expect(collection.get(1)?.contact_person_id).toBe("canonical");
    expect(collection.get(2)?.contact_person_id).toBe("other");
    expect(collection.get(3)?.contact_person_id).toBe("canonical");
    expect(collection.get(3)?.active).toBe(false);
    unregister();
  });

  it("drops every write captured before a reset", async () => {
    const { collection, unregister } = await setup();
    const isCurrent = captureAdminOrganizationsFence();

    await resetAdminOrganizationsCollection(collection);
    expect(collection.size).toBe(0);

    await applyAdminOrganizationSaved(
      collection,
      { ...seedOrganizations[2]!, id: 9, name: "Late" },
      isCurrent,
    );
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

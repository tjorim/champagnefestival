import { describe, expect, it, vi } from "vitest";
import {
  applyAdminLayoutDeleted,
  applyAdminVenueDeleted,
  applyAdminVenueRowCreated,
  applyAdminVenueRowUpdated,
  captureAdminVenueFence,
  createAdminVenueCollections,
  refetchAdminVenueCollections,
  registerAdminVenueCollections,
  replaceAdminAreasForLayout,
  resetAdminVenueCollections,
} from "@/state/adminVenueCollections";
import type { FloorArea } from "@/types/admin";
import { createTestQueryClient } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer test" });

function area(id: string, layoutId: string): FloorArea {
  return {
    id,
    layoutId,
    icon: "bi-shop",
    organizationId: null,
    label: id,
    x: 1,
    y: 1,
    rotation: 0,
    widthM: 1,
    lengthM: 1,
  };
}

async function setup() {
  const collections = createAdminVenueCollections({
    queryClient: createTestQueryClient(),
    authHeaders,
    enabled: false,
  });
  const unregister = registerAdminVenueCollections(collections);
  await collections.venues.utils.writeUpsert({
    id: "v1",
    name: "V1",
    address: "",
    city: "",
    postalCode: "",
    country: "",
    lat: 0,
    lng: 0,
    active: true,
  });
  await collections.rooms.utils.writeUpsert([
    {
      id: "r1",
      venueId: "v1",
      name: "R1",
      widthM: 1,
      lengthM: 1,
      color: "",
      active: true,
      dimensionsPlaceholder: false,
    },
    {
      id: "r2",
      venueId: "v2",
      name: "R2",
      widthM: 1,
      lengthM: 1,
      color: "",
      active: true,
      dimensionsPlaceholder: false,
    },
  ]);
  await collections.layouts.utils.writeUpsert([
    {
      id: "l1",
      eventId: "e",
      eventTitle: "",
      editionId: null,
      roomId: "r1",
      date: null,
      label: "",
      createdAt: "",
    },
    {
      id: "l2",
      eventId: "e",
      eventTitle: "",
      editionId: null,
      roomId: "r2",
      date: null,
      label: "",
      createdAt: "",
    },
  ]);
  await collections.areas.utils.writeUpsert([area("a1", "l1"), area("a2", "l1"), area("a3", "l2")]);
  return { collections, unregister };
}

describe("admin venue collections", () => {
  it("removes a venue's rooms, layouts and areas and reports the removed layouts", async () => {
    const { collections, unregister } = await setup();

    const layoutIds = await applyAdminVenueDeleted(collections, "v1", captureAdminVenueFence());

    expect(layoutIds).toEqual(["l1"]);
    expect(Array.from(collections.venues.keys())).toEqual([]);
    expect(Array.from(collections.rooms.keys())).toEqual(["r2"]);
    expect(Array.from(collections.layouts.keys())).toEqual(["l2"]);
    expect(Array.from(collections.areas.keys())).toEqual(["a3"]);
    unregister();
  });

  it("removes a layout and its areas only", async () => {
    const { collections, unregister } = await setup();

    await applyAdminLayoutDeleted(collections, "l1", captureAdminVenueFence());

    expect(Array.from(collections.layouts.keys())).toEqual(["l2"]);
    expect(Array.from(collections.areas.keys())).toEqual(["a3"]);
    unregister();
  });

  it("replaces one layout's areas without touching another layout's", async () => {
    const { collections, unregister } = await setup();

    await replaceAdminAreasForLayout(
      collections.areas,
      "l1",
      [{ ...area("a1", "l1"), label: "restored" }, area("a4", "l1")],
      captureAdminVenueFence(),
    );

    expect(Array.from(collections.areas.keys()).sort()).toEqual(["a1", "a3", "a4"]);
    expect(collections.areas.get("a1")?.label).toBe("restored");
    unregister();
  });

  it("does not invent a row for an update to a row it does not hold", async () => {
    const { collections, unregister } = await setup();

    await applyAdminVenueRowUpdated(
      collections.areas,
      area("gone", "l1"),
      captureAdminVenueFence(),
    );
    await applyAdminVenueRowCreated(collections.areas, area("new", "l1"), captureAdminVenueFence());

    expect(collections.areas.has("gone")).toBe(false);
    expect(collections.areas.has("new")).toBe(true);
    unregister();
  });

  it("drops every write captured before a reset", async () => {
    const { collections, unregister } = await setup();
    const isCurrent = captureAdminVenueFence();

    await resetAdminVenueCollections(collections);
    expect(collections.areas.size).toBe(0);
    expect(collections.venues.size).toBe(0);

    await applyAdminVenueRowCreated(collections.areas, area("late", "l1"), isCurrent);
    await applyAdminVenueRowUpdated(collections.areas, area("late", "l1"), isCurrent);
    expect(await applyAdminVenueDeleted(collections, "v1", isCurrent)).toEqual([]);
    expect(collections.areas.size).toBe(0);
    unregister();
  });

  it("skips a refetch that follows a write from an earlier session", async () => {
    const { collections, unregister } = await setup();
    const refetch = vi.spyOn(collections.venues.utils, "refetch").mockResolvedValue([]);
    const isCurrent = captureAdminVenueFence();

    await refetchAdminVenueCollections(collections, ["venues"], isCurrent);
    expect(refetch).toHaveBeenCalledTimes(1);

    await resetAdminVenueCollections(collections);
    await refetchAdminVenueCollections(collections, ["venues"], isCurrent);
    expect(refetch).toHaveBeenCalledTimes(1);
    unregister();
  });
});

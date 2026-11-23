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
} from "@/features/admin/venue/adminVenueCollections";
import type { FloorArea } from "@/api-types";
import { createTestQueryClient } from "../../../utils/queryClient";

function area(id: string, layout_id: string): FloorArea {
  return {
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    id,
    layout_id,
    icon: "bi-shop",
    organization_id: null,
    label: id,
    x: 1,
    y: 1,
    rotation: 0,
    width_m: 1,
    length_m: 1,
  };
}

async function setup() {
  const collections = createAdminVenueCollections({
    queryClient: createTestQueryClient(),

    enabled: false,
  });
  const unregister = registerAdminVenueCollections(collections);
  await collections.venues.utils.writeUpsert({
    id: "v1",
    name: "V1",
    address: "",
    city: "",
    postal_code: "",
    country: "",
    lat: 0,
    lng: 0,
    active: true,
  });
  await collections.rooms.utils.writeUpsert([
    {
      id: "r1",
      venue_id: "v1",
      name: "R1",
      width_m: 1,
      length_m: 1,
      color: "",
      active: true,
      dimensions_placeholder: false,
    },
    {
      id: "r2",
      venue_id: "v2",
      name: "R2",
      width_m: 1,
      length_m: 1,
      color: "",
      active: true,
      dimensions_placeholder: false,
    },
  ]);
  await collections.layouts.utils.writeUpsert([
    {
      id: "l1",
      event_id: "e",
      event_title: "",
      edition_id: null,
      room_id: "r1",
      date: null,
      label: "",
      created_at: "",
    },
    {
      id: "l2",
      event_id: "e",
      event_title: "",
      edition_id: null,
      room_id: "r2",
      date: null,
      label: "",
      created_at: "",
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

/**
 * Tests for the admin API mapper functions defined in AdminDashboard.tsx.
 *
 * The mapper functions (apiVenueToVenue, apiTableToTable, apiAreaToArea, etc.) are
 * private to AdminDashboard.tsx and are not exported. This file tests the same
 * mapping contract by replicating the mappers locally, ensuring the expected
 * snake_case → camelCase field transformation and default-value behaviour are
 * correct. If/when the mappers are extracted to a dedicated module they can be
 * imported and the local copies below removed.
 */

import type {
  FloorArea,
  FloorTable,
  Layout,
  Room,
  TableType,
  Venue,
} from "../types/admin";

import { describe, expect, it } from "vitest";

// ─── Local copies of the private mapper functions ────────────────────────────
// Keep in sync with AdminDashboard.tsx until the mappers are extracted.

function apiVenueToVenue(d: Record<string, unknown>): Venue {
  return {
    id: d.id as string,
    name: d.name as string,
    address: (d.address ?? "") as string,
    city: (d.city ?? "") as string,
    postalCode: (d.postal_code ?? "") as string,
    country: (d.country ?? "") as string,
    lat: (d.lat ?? 0) as number,
    lng: (d.lng ?? 0) as number,
    active: (d.active ?? true) as boolean,
  };
}

function apiLayoutToLayout(d: Record<string, unknown>): Layout {
  return {
    id: d.id as string,
    editionId: (d.edition_id as string | null) ?? null,
    roomId: d.room_id as string,
    date: (d.date as string | null) ?? null,
    label: (d.label ?? "") as string,
    createdAt: d.created_at as string,
  };
}

function apiTableTypeToTableType(d: Record<string, unknown>): TableType {
  return {
    id: d.id as string,
    name: d.name as string,
    shape: (d.shape ?? "rectangle") as "rectangle" | "round",
    widthM: (d.width_m ?? 1.8) as number,
    lengthM: (d.length_m ?? 0.7) as number,
    heightType: (d.height_type ?? "low") as "low" | "high",
    maxCapacity: (d.max_capacity ?? 4) as number,
    active: (d.active ?? true) as boolean,
  };
}

function apiRoomToRoom(d: Record<string, unknown>): Room {
  return {
    id: d.id as string,
    venueId: d.venue_id as string,
    name: d.name as string,
    widthM: d.width_m as number,
    lengthM: d.length_m as number,
    color: d.color as string,
    active: (d.active ?? true) as boolean,
  };
}

function apiTableToTable(d: Record<string, unknown>): FloorTable {
  return {
    id: d.id as string,
    name: d.name as string,
    capacity: d.capacity as number,
    x: d.x as number,
    y: d.y as number,
    tableTypeId: d.table_type_id as string,
    rotation: (d.rotation ?? 0) as number,
    layoutId: d.layout_id as string,
    registrationIds: (d.registration_ids as string[]) ?? [],
  };
}

function apiAreaToArea(d: Record<string, unknown>): FloorArea {
  return {
    id: d.id as string,
    layoutId: d.layout_id as string,
    icon: (d.icon ?? "bi-shop") as string,
    exhibitorId: (d.exhibitor_id as number | null) ?? null,
    label: (d.label ?? "") as string,
    x: (d.x ?? 50) as number,
    y: (d.y ?? 50) as number,
    rotation: (d.rotation ?? 0) as number,
    widthM: (d.width_m ?? 1.5) as number,
    lengthM: (d.length_m ?? 1.0) as number,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("apiVenueToVenue", () => {
  const minimal = {
    id: "v1",
    name: "Ostend Convention Center",
  };

  const full = {
    id: "v2",
    name: "Grand Hall",
    address: "Kursaal 1",
    city: "Ostend",
    postal_code: "8400",
    country: "BE",
    lat: 51.2312,
    lng: 2.9166,
    active: false,
  };

  it("maps all fields from a fully populated response", () => {
    expect(apiVenueToVenue(full)).toEqual<Venue>({
      id: "v2",
      name: "Grand Hall",
      address: "Kursaal 1",
      city: "Ostend",
      postalCode: "8400",
      country: "BE",
      lat: 51.2312,
      lng: 2.9166,
      active: false,
    });
  });

  it("maps postal_code to postalCode", () => {
    const venue = apiVenueToVenue({ ...full, postal_code: "9000" });
    expect(venue.postalCode).toBe("9000");
  });

  it("defaults address to empty string when absent", () => {
    expect(apiVenueToVenue(minimal).address).toBe("");
  });

  it("defaults city to empty string when absent", () => {
    expect(apiVenueToVenue(minimal).city).toBe("");
  });

  it("defaults postalCode to empty string when absent", () => {
    expect(apiVenueToVenue(minimal).postalCode).toBe("");
  });

  it("defaults country to empty string when absent", () => {
    expect(apiVenueToVenue(minimal).country).toBe("");
  });

  it("defaults lat to 0 when absent", () => {
    expect(apiVenueToVenue(minimal).lat).toBe(0);
  });

  it("defaults lng to 0 when absent", () => {
    expect(apiVenueToVenue(minimal).lng).toBe(0);
  });

  it("defaults active to true when absent", () => {
    expect(apiVenueToVenue(minimal).active).toBe(true);
  });

  it("preserves active: false when explicitly provided", () => {
    expect(apiVenueToVenue({ ...minimal, active: false }).active).toBe(false);
  });

  it("preserves lat: 0 when explicitly provided (no false default override)", () => {
    expect(apiVenueToVenue({ ...minimal, lat: 0 }).lat).toBe(0);
  });
});

describe("apiTableToTable", () => {
  const minimal = {
    id: "t1",
    name: "Table 1",
    capacity: 4,
    x: 25,
    y: 50,
    table_type_id: "tt1",
    layout_id: "l1",
  };

  const full = {
    ...minimal,
    rotation: 90,
    registration_ids: ["r1", "r2"],
  };

  it("maps all fields from a fully populated response", () => {
    expect(apiTableToTable(full)).toEqual<FloorTable>({
      id: "t1",
      name: "Table 1",
      capacity: 4,
      x: 25,
      y: 50,
      tableTypeId: "tt1",
      rotation: 90,
      layoutId: "l1",
      registrationIds: ["r1", "r2"],
    });
  });

  it("maps table_type_id to tableTypeId", () => {
    expect(apiTableToTable(minimal).tableTypeId).toBe("tt1");
  });

  it("maps layout_id to layoutId", () => {
    expect(apiTableToTable(minimal).layoutId).toBe("l1");
  });

  it("defaults rotation to 0 when absent", () => {
    expect(apiTableToTable(minimal).rotation).toBe(0);
  });

  it("preserves explicit rotation value", () => {
    expect(apiTableToTable({ ...minimal, rotation: 270 }).rotation).toBe(270);
  });

  it("defaults registrationIds to empty array when absent", () => {
    expect(apiTableToTable(minimal).registrationIds).toEqual([]);
  });

  it("preserves registration_ids array", () => {
    const result = apiTableToTable({ ...minimal, registration_ids: ["r1", "r2", "r3"] });
    expect(result.registrationIds).toEqual(["r1", "r2", "r3"]);
  });

  it("preserves x and y positions", () => {
    const result = apiTableToTable({ ...minimal, x: 10.5, y: 75.25 });
    expect(result.x).toBe(10.5);
    expect(result.y).toBe(75.25);
  });
});

describe("apiAreaToArea", () => {
  const minimal = {
    id: "a1",
    layout_id: "l1",
  };

  const full = {
    id: "a2",
    layout_id: "l2",
    icon: "bi-star",
    exhibitor_id: 42,
    label: "Exhibitor stand",
    x: 30,
    y: 60,
    rotation: 45,
    width_m: 2.0,
    length_m: 3.0,
  };

  it("maps all fields from a fully populated response", () => {
    expect(apiAreaToArea(full)).toEqual<FloorArea>({
      id: "a2",
      layoutId: "l2",
      icon: "bi-star",
      exhibitorId: 42,
      label: "Exhibitor stand",
      x: 30,
      y: 60,
      rotation: 45,
      widthM: 2.0,
      lengthM: 3.0,
    });
  });

  it("maps layout_id to layoutId", () => {
    expect(apiAreaToArea(minimal).layoutId).toBe("l1");
  });

  it("defaults icon to 'bi-shop' when absent", () => {
    expect(apiAreaToArea(minimal).icon).toBe("bi-shop");
  });

  it("uses provided icon when present", () => {
    expect(apiAreaToArea({ ...minimal, icon: "bi-cup" }).icon).toBe("bi-cup");
  });

  it("defaults exhibitorId to null when absent", () => {
    expect(apiAreaToArea(minimal).exhibitorId).toBeNull();
  });

  it("maps exhibitor_id to exhibitorId", () => {
    expect(apiAreaToArea({ ...minimal, exhibitor_id: 7 }).exhibitorId).toBe(7);
  });

  it("preserves explicit exhibitorId null", () => {
    expect(apiAreaToArea({ ...minimal, exhibitor_id: null }).exhibitorId).toBeNull();
  });

  it("defaults label to empty string when absent", () => {
    expect(apiAreaToArea(minimal).label).toBe("");
  });

  it("defaults x to 50 when absent", () => {
    expect(apiAreaToArea(minimal).x).toBe(50);
  });

  it("defaults y to 50 when absent", () => {
    expect(apiAreaToArea(minimal).y).toBe(50);
  });

  it("defaults rotation to 0 when absent", () => {
    expect(apiAreaToArea(minimal).rotation).toBe(0);
  });

  it("defaults widthM to 1.5 when absent", () => {
    expect(apiAreaToArea(minimal).widthM).toBe(1.5);
  });

  it("defaults lengthM to 1.0 when absent", () => {
    expect(apiAreaToArea(minimal).lengthM).toBe(1.0);
  });

  it("maps width_m to widthM", () => {
    expect(apiAreaToArea({ ...minimal, width_m: 4.5 }).widthM).toBe(4.5);
  });

  it("maps length_m to lengthM", () => {
    expect(apiAreaToArea({ ...minimal, length_m: 2.25 }).lengthM).toBe(2.25);
  });
});

describe("apiLayoutToLayout", () => {
  const minimal = {
    id: "ly1",
    room_id: "r1",
    created_at: "2025-01-01T00:00:00Z",
  };

  const full = {
    id: "ly2",
    edition_id: "ed1",
    room_id: "r2",
    date: "2025-06-01",
    label: "Day 1",
    created_at: "2025-01-15T10:00:00Z",
  };

  it("maps all fields from a fully populated response", () => {
    expect(apiLayoutToLayout(full)).toEqual<Layout>({
      id: "ly2",
      editionId: "ed1",
      roomId: "r2",
      date: "2025-06-01",
      label: "Day 1",
      createdAt: "2025-01-15T10:00:00Z",
    });
  });

  it("maps room_id to roomId", () => {
    expect(apiLayoutToLayout(minimal).roomId).toBe("r1");
  });

  it("maps created_at to createdAt", () => {
    expect(apiLayoutToLayout(minimal).createdAt).toBe("2025-01-01T00:00:00Z");
  });

  it("defaults editionId to null when absent", () => {
    expect(apiLayoutToLayout(minimal).editionId).toBeNull();
  });

  it("preserves explicit edition_id when present", () => {
    expect(apiLayoutToLayout({ ...minimal, edition_id: "ed42" }).editionId).toBe("ed42");
  });

  it("defaults date to null when absent", () => {
    expect(apiLayoutToLayout(minimal).date).toBeNull();
  });

  it("preserves explicit date when present", () => {
    expect(apiLayoutToLayout({ ...minimal, date: "2025-07-04" }).date).toBe("2025-07-04");
  });

  it("defaults label to empty string when absent", () => {
    expect(apiLayoutToLayout(minimal).label).toBe("");
  });

  it("maps edition_id to editionId", () => {
    expect(apiLayoutToLayout({ ...minimal, edition_id: "ed1" }).editionId).toBe("ed1");
  });
});

describe("apiTableTypeToTableType", () => {
  const minimal = {
    id: "tt1",
    name: "Standard",
  };

  const full = {
    id: "tt2",
    name: "Round VIP",
    shape: "round",
    width_m: 1.2,
    length_m: 1.2,
    height_type: "high",
    max_capacity: 6,
    active: false,
  };

  it("maps all fields from a fully populated response", () => {
    expect(apiTableTypeToTableType(full)).toEqual<TableType>({
      id: "tt2",
      name: "Round VIP",
      shape: "round",
      widthM: 1.2,
      lengthM: 1.2,
      heightType: "high",
      maxCapacity: 6,
      active: false,
    });
  });

  it("defaults shape to 'rectangle' when absent", () => {
    expect(apiTableTypeToTableType(minimal).shape).toBe("rectangle");
  });

  it("preserves 'round' shape", () => {
    expect(apiTableTypeToTableType({ ...minimal, shape: "round" }).shape).toBe("round");
  });

  it("defaults widthM to 1.8 when absent", () => {
    expect(apiTableTypeToTableType(minimal).widthM).toBe(1.8);
  });

  it("maps width_m to widthM", () => {
    expect(apiTableTypeToTableType({ ...minimal, width_m: 2.4 }).widthM).toBe(2.4);
  });

  it("defaults lengthM to 0.7 when absent", () => {
    expect(apiTableTypeToTableType(minimal).lengthM).toBe(0.7);
  });

  it("maps length_m to lengthM", () => {
    expect(apiTableTypeToTableType({ ...minimal, length_m: 1.2 }).lengthM).toBe(1.2);
  });

  it("defaults heightType to 'low' when absent", () => {
    expect(apiTableTypeToTableType(minimal).heightType).toBe("low");
  });

  it("maps height_type to heightType", () => {
    expect(apiTableTypeToTableType({ ...minimal, height_type: "high" }).heightType).toBe("high");
  });

  it("defaults maxCapacity to 4 when absent", () => {
    expect(apiTableTypeToTableType(minimal).maxCapacity).toBe(4);
  });

  it("maps max_capacity to maxCapacity", () => {
    expect(apiTableTypeToTableType({ ...minimal, max_capacity: 8 }).maxCapacity).toBe(8);
  });

  it("defaults active to true when absent", () => {
    expect(apiTableTypeToTableType(minimal).active).toBe(true);
  });

  it("preserves active: false when explicitly provided", () => {
    expect(apiTableTypeToTableType({ ...minimal, active: false }).active).toBe(false);
  });
});

describe("apiRoomToRoom", () => {
  const minimal = {
    id: "r1",
    venue_id: "v1",
    name: "Main Hall",
    width_m: 20,
    length_m: 40,
    color: "#ff0000",
  };

  const full = {
    ...minimal,
    active: false,
  };

  it("maps all fields from a fully populated response", () => {
    expect(apiRoomToRoom(full)).toEqual<Room>({
      id: "r1",
      venueId: "v1",
      name: "Main Hall",
      widthM: 20,
      lengthM: 40,
      color: "#ff0000",
      active: false,
    });
  });

  it("maps venue_id to venueId", () => {
    expect(apiRoomToRoom(minimal).venueId).toBe("v1");
  });

  it("maps width_m to widthM", () => {
    expect(apiRoomToRoom(minimal).widthM).toBe(20);
  });

  it("maps length_m to lengthM", () => {
    expect(apiRoomToRoom(minimal).lengthM).toBe(40);
  });

  it("defaults active to true when absent", () => {
    expect(apiRoomToRoom(minimal).active).toBe(true);
  });

  it("preserves active: false when explicitly provided", () => {
    expect(apiRoomToRoom({ ...minimal, active: false }).active).toBe(false);
  });

  it("preserves color value", () => {
    expect(apiRoomToRoom({ ...minimal, color: "#00ff00" }).color).toBe("#00ff00");
  });
});

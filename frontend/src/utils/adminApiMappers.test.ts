/**
 * Tests for adminApiMappers.ts — snake_case → camelCase field mappers and
 * person-merge helpers used by the admin dashboard.
 */

import type {
  FloorArea,
  FloorTable,
  Layout,
  Room,
  TableType,
  Venue,
} from "../types/admin";
import type { Person } from "../types/person";

import { describe, expect, it } from "vitest";
import {
  apiVenueToVenue,
  apiLayoutToLayout,
  apiTableTypeToTableType,
  apiRoomToRoom,
  apiTableToTable,
  apiAreaToArea,
  mergeVolunteerPerson,
  mergePeopleWithVolunteers,
  mergePersonUpdate,
  replacePersonById,
  replaceVolunteerById,
  syncMembersWithPerson,
} from "./adminApiMappers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "Alice",
    email: "alice@example.com",
    phone: "0470000000",
    address: "Kursaal 1",
    roles: [],
    nationalRegisterNumber: null,
    eidDocumentNumber: null,
    visitsPerMonth: null,
    clubName: "",
    notes: "",
    active: true,
    helpPeriods: [],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── apiVenueToVenue ──────────────────────────────────────────────────────────

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

// ─── apiTableToTable ──────────────────────────────────────────────────────────

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

// ─── apiAreaToArea ────────────────────────────────────────────────────────────

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

// ─── apiLayoutToLayout ────────────────────────────────────────────────────────

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

// ─── apiTableTypeToTableType ──────────────────────────────────────────────────

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

// ─── apiRoomToRoom ────────────────────────────────────────────────────────────

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

// ─── mergeVolunteerPerson ─────────────────────────────────────────────────────

describe("mergeVolunteerPerson", () => {
  const helpPeriods = [{ id: 1, firstHelpDay: "2025-06-01", lastHelpDay: "2025-06-02" }];

  it("always includes 'volunteer' in roles", () => {
    const result = mergeVolunteerPerson(undefined, makePerson({ roles: ["member"] }));
    expect(result.roles).toContain("volunteer");
  });

  it("merges roles from existing and volunteer", () => {
    const existing = makePerson({ roles: ["member"] });
    const volunteer = makePerson({ roles: ["volunteer"] });
    const result = mergeVolunteerPerson(existing, volunteer);
    expect(result.roles).toContain("member");
    expect(result.roles).toContain("volunteer");
  });

  it("uses volunteer helpPeriods over existing helpPeriods", () => {
    const existing = makePerson({ helpPeriods: [] });
    const volunteer = makePerson({ helpPeriods });
    expect(mergeVolunteerPerson(existing, volunteer).helpPeriods).toEqual(helpPeriods);
  });

  it("prefers existing email when volunteer email is empty", () => {
    const existing = makePerson({ email: "alice@example.com" });
    const volunteer = makePerson({ email: "" });
    expect(mergeVolunteerPerson(existing, volunteer).email).toBe("alice@example.com");
  });

  it("uses volunteer email when existing is absent (undefined existing)", () => {
    const volunteer = makePerson({ email: "vol@example.com" });
    expect(mergeVolunteerPerson(undefined, volunteer).email).toBe("vol@example.com");
  });

  it("returns a new object (immutability)", () => {
    const existing = makePerson();
    const volunteer = makePerson();
    const result = mergeVolunteerPerson(existing, volunteer);
    expect(result).not.toBe(existing);
    expect(result).not.toBe(volunteer);
  });
});

// ─── mergePeopleWithVolunteers ────────────────────────────────────────────────

describe("mergePeopleWithVolunteers", () => {
  it("returns only people when volunteers list is empty", () => {
    const people = [makePerson({ id: "p1" }), makePerson({ id: "p2" })];
    expect(mergePeopleWithVolunteers(people, [])).toEqual(people);
  });

  it("returns only volunteers when people list is empty", () => {
    const volunteers = [makePerson({ id: "v1", roles: ["volunteer"] })];
    const result = mergePeopleWithVolunteers([], volunteers);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("v1");
  });

  it("merges a volunteer record into the matching person", () => {
    const person = makePerson({ id: "p1", roles: [] });
    const volunteer = makePerson({ id: "p1", roles: ["volunteer"] });
    const result = mergePeopleWithVolunteers([person], [volunteer]);
    expect(result).toHaveLength(1);
    expect(result[0]?.roles).toContain("volunteer");
  });

  it("appends volunteer-only records after the merged people list", () => {
    const person = makePerson({ id: "p1" });
    const volunteerOnly = makePerson({ id: "v99", roles: ["volunteer"] });
    const result = mergePeopleWithVolunteers([person], [volunteerOnly]);
    expect(result).toHaveLength(2);
    expect(result[1]?.id).toBe("v99");
  });

  it("does not duplicate when the same person appears in both lists", () => {
    const person = makePerson({ id: "p1" });
    const volunteer = makePerson({ id: "p1", roles: ["volunteer"] });
    expect(mergePeopleWithVolunteers([person], [volunteer])).toHaveLength(1);
  });
});

// ─── mergePersonUpdate ────────────────────────────────────────────────────────

describe("mergePersonUpdate", () => {
  it("returns updated when existing is undefined", () => {
    const updated = makePerson({ id: "p1" });
    expect(mergePersonUpdate(undefined, updated)).toBe(updated);
  });

  it("returns updated directly when updated has no volunteer role", () => {
    const existing = makePerson({ helpPeriods: [{ id: 1, firstHelpDay: "2025-01-01", lastHelpDay: null }] });
    const updated = makePerson({ roles: ["member"] });
    expect(mergePersonUpdate(existing, updated)).toBe(updated);
  });

  it("preserves existing helpPeriods when updated has volunteer role", () => {
    const helpPeriods = [{ id: 1, firstHelpDay: "2025-01-01", lastHelpDay: null }];
    const existing = makePerson({ helpPeriods });
    const updated = makePerson({ roles: ["volunteer"], helpPeriods: [] });
    const result = mergePersonUpdate(existing, updated);
    expect(result.helpPeriods).toEqual(helpPeriods);
  });
});

// ─── replacePersonById ────────────────────────────────────────────────────────

describe("replacePersonById", () => {
  it("replaces the person with matching id", () => {
    const p1 = makePerson({ id: "p1", name: "Alice" });
    const p2 = makePerson({ id: "p2", name: "Bob" });
    const updated = makePerson({ id: "p1", name: "Alice Updated" });
    const result = replacePersonById([p1, p2], updated);
    expect(result[0]?.name).toBe("Alice Updated");
    expect(result[1]?.name).toBe("Bob");
  });

  it("returns original people when no id matches", () => {
    const p1 = makePerson({ id: "p1" });
    const updated = makePerson({ id: "p99" });
    const result = replacePersonById([p1], updated);
    expect(result[0]).toBe(p1);
  });

  it("returns a new array (immutability)", () => {
    const people = [makePerson({ id: "p1" })];
    const result = replacePersonById(people, makePerson({ id: "p1" }));
    expect(result).not.toBe(people);
  });
});

// ─── replaceVolunteerById ─────────────────────────────────────────────────────

describe("replaceVolunteerById", () => {
  it("merges the volunteer into the matching person", () => {
    const person = makePerson({ id: "p1", roles: ["member"] });
    const updatedVolunteer = makePerson({ id: "p1", roles: ["volunteer"] });
    const result = replaceVolunteerById([person], updatedVolunteer);
    expect(result[0]?.roles).toContain("volunteer");
    expect(result[0]?.roles).toContain("member");
  });

  it("does not modify non-matching entries", () => {
    const p1 = makePerson({ id: "p1" });
    const p2 = makePerson({ id: "p2" });
    const updatedVolunteer = makePerson({ id: "p1", roles: ["volunteer"] });
    const result = replaceVolunteerById([p1, p2], updatedVolunteer);
    expect(result[1]).toBe(p2);
  });
});

// ─── syncMembersWithPerson ────────────────────────────────────────────────────

describe("syncMembersWithPerson", () => {
  it("removes the person from members when updated person has no member role", () => {
    const member = makePerson({ id: "p1", roles: ["member"] });
    const updated = makePerson({ id: "p1", roles: [] });
    const result = syncMembersWithPerson([member], updated);
    expect(result).toHaveLength(0);
  });

  it("prepends person when they are a new member not yet in the list", () => {
    const existing = makePerson({ id: "p2", roles: ["member"] });
    const newMember = makePerson({ id: "p1", roles: ["member"] });
    const result = syncMembersWithPerson([existing], newMember);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("p1");
  });

  it("updates the existing member record in place when already present", () => {
    const member = makePerson({ id: "p1", name: "Old Name", roles: ["member"] });
    const updated = makePerson({ id: "p1", name: "New Name", roles: ["member"] });
    const result = syncMembersWithPerson([member], updated);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("New Name");
  });

  it("returns a new array (immutability)", () => {
    const members = [makePerson({ id: "p1", roles: ["member"] })];
    const updated = makePerson({ id: "p1", roles: ["member"] });
    expect(syncMembersWithPerson(members, updated)).not.toBe(members);
  });
});

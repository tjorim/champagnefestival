/**
 * Tests for adminApiMappers.ts — person-merge helpers used by the admin dashboard.
 */

import type { Person } from "@/types/person";

import { describe, expect, it } from "vitest";
import {
  mergeVolunteerPerson,
  mergePeopleWithVolunteers,
  attachVolunteerDetails,
  mergePersonUpdate,
} from "@/lib/api/adminApiMappers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    preferred_language: null,
    inactivity_exempt: false,
    inactivity_exempt_note: "",
    id: "p1",
    name: "Alice",
    email: "alice@example.com",
    phone: "0470000000",
    address: "Kursaal 1",
    roles: [],
    national_register_number: null,
    eid_document_number: null,
    notes: "",
    anonymised: false,
    retired_roles: {},
    role_history: {},
    help_periods: [],
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── mergeVolunteerPerson ─────────────────────────────────────────────────────

describe("mergeVolunteerPerson", () => {
  const help_periods = [
    { id: 1, first_help_day: "2025-06-01", last_help_day: "2025-06-02", notes: "" },
  ];

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

  it("uses volunteer help_periods over existing help_periods", () => {
    const existing = makePerson({ help_periods: [] });
    const volunteer = makePerson({ help_periods });
    expect(mergeVolunteerPerson(existing, volunteer).help_periods).toEqual(help_periods);
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
    const person = makePerson({
      preferred_language: null,
      inactivity_exempt: false,
      inactivity_exempt_note: "",
      id: "p1",
      roles: [],
    });
    const volunteer = makePerson({
      preferred_language: null,
      inactivity_exempt: false,
      inactivity_exempt_note: "",
      id: "p1",
      roles: ["volunteer"],
    });
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
    const volunteer = makePerson({
      preferred_language: null,
      inactivity_exempt: false,
      inactivity_exempt_note: "",
      id: "p1",
      roles: ["volunteer"],
    });
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
    const existing = makePerson({
      help_periods: [{ id: 1, first_help_day: "2025-01-01", last_help_day: null, notes: "" }],
    });
    const updated = makePerson({ roles: ["member"] });
    expect(mergePersonUpdate(existing, updated)).toBe(updated);
  });

  it("preserves existing help_periods when updated has volunteer role", () => {
    const help_periods = [{ id: 1, first_help_day: "2025-01-01", last_help_day: null, notes: "" }];
    const existing = makePerson({ help_periods });
    const updated = makePerson({ roles: ["volunteer"], help_periods: [] });
    const result = mergePersonUpdate(existing, updated);
    expect(result.help_periods).toEqual(help_periods);
  });
});

// ─── attachVolunteerDetails ───────────────────────────────────────────────────

describe("attachVolunteerDetails", () => {
  it("adds help periods to a matching volunteer and leaves other rows untouched", () => {
    const help_periods = [{ id: 1, first_help_day: "2026-10-10", last_help_day: null, notes: "" }];
    const person = makePerson({
      preferred_language: null,
      inactivity_exempt: false,
      inactivity_exempt_note: "",
      id: "p1",
      roles: ["volunteer"],
    });
    const other = makePerson({ id: "p2", roles: ["member"] });

    const result = attachVolunteerDetails(
      [person, other],
      [
        makePerson({
          preferred_language: null,
          inactivity_exempt: false,
          inactivity_exempt_note: "",
          id: "p1",
          roles: ["volunteer"],
          help_periods,
        }),
      ],
    );

    expect(result[0]?.help_periods).toEqual(help_periods);
    expect(result[1]).toBe(other);
  });

  it("never adds a volunteer that is not already in the list", () => {
    const person = makePerson({
      preferred_language: null,
      inactivity_exempt: false,
      inactivity_exempt_note: "",
      id: "p1",
      roles: ["member"],
    });

    const result = attachVolunteerDetails(
      [person],
      [makePerson({ id: "v9", roles: ["volunteer"] })],
    );

    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });
});

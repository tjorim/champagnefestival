import type { Person } from "@/api-types";
export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "person",
    name: "Alice",
    email: "",
    phone: "",
    preferred_language: null,
    address: "",
    roles: [],
    retired_roles: {},
    role_history: {},
    inactivity_exempt: false,
    inactivity_exempt_note: "",
    visits_per_month: null,
    notes: "",
    anonymised: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

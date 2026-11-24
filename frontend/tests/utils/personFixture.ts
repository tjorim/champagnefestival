import type { Person, PersonListItemOut, PersonOut } from "@/api-types";
export function makePerson(
  overrides: Partial<Person> = {},
): Person & PersonListItemOut & PersonOut {
  return {
    registration_count: 0,
    reward_due: false,
    last_attended: null,
    inactivity_highlight: false,
    national_register_number: null,
    eid_document_number: null,
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
    notes: "",
    anonymised: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

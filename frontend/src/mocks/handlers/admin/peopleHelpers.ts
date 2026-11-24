import { localIsoDate } from "@/types/person";
import { type MockPerson } from "../../data/people";
import { sharedStore } from "../../data/registrations";
import { people, stampCards } from "./state";

export function hasRewardDue(id: unknown) {
  return stampCards.some(
    (card) => card.person_id === id && card.reward && !card.reward.handed_out_at,
  );
}

/** Mirrors the paged people contract for authenticated UI tests. */
// Active in a role: not archived as a whole and not retired from that role (as the backend does).
export function isActiveIn(person: MockPerson, role: string | null | undefined): boolean {
  const retired = (person.retired_roles ?? {}) as Record<string, string>;
  return !person.anonymised && !(role && Object.hasOwn(retired, role));
}
export function filteredPeople(url: URL, role?: string) {
  const active = url.searchParams.get("active");
  const requestedRole = role ?? url.searchParams.get("role");
  const q = url.searchParams.get("q")?.toLowerCase().trim();
  return people.filter(
    (person) =>
      (!url.searchParams.has("reward_due") ||
        hasRewardDue(person.id) === (url.searchParams.get("reward_due") === "true")) &&
      (active === null || isActiveIn(person, requestedRole) === (active === "true")) &&
      (!requestedRole || (person.roles as string[]).includes(requestedRole)) &&
      (!q ||
        [
          "name",
          "email",
          "phone",
          "address",
          "national_register_number",
          "eid_document_number",
          "notes",
        ].some((field) =>
          String(person[field as keyof MockPerson] ?? "")
            .toLowerCase()
            .includes(q),
        ) ||
        (person.roles as string[]).some((value) => value.includes(q))),
  );
}
export function retireMockRole(person: MockPerson, role: string): MockPerson {
  const retired = (person.retired_roles ?? {}) as Record<string, string>;
  return Object.hasOwn(retired, role)
    ? person
    : { ...person, retired_roles: { ...retired, [role]: localIsoDate() } };
}
export function reactivateMockRole(person: MockPerson, role: string): MockPerson {
  const { [role]: _removed, ...retired } = (person.retired_roles ?? {}) as Record<string, string>;
  return { ...person, retired_roles: retired };
}
export function peopleEnvelope(
  url: URL,
  role?: string,
): import("@/api-types").PersonListEnvelope & import("@/api-types").VolunteerListEnvelope {
  const rows = filteredPeople(url, role).map((person) => ({
    ...person,
    last_attended: null,
    inactivity_highlight: false,
    reward_due: hasRewardDue(person.id),
    registration_count: sharedStore.registrations.filter(
      (registration) => registration.person_id === person.id,
    ).length,
  }));
  const sort = url.searchParams.get("sort");
  const field = sort === "created" ? "created_at" : sort === "updated" ? "updated_at" : sort;
  const direction = url.searchParams.get("sort_dir") === "desc" ? -1 : 1;
  if (field)
    rows.sort((a, b) => {
      const left = a[field as keyof typeof a];
      const right = b[field as keyof typeof b];
      return (
        direction *
          (typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""))) ||
        String(a.id).localeCompare(String(b.id))
      );
    });
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const page = Number(url.searchParams.get("page") ?? 1);
  return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, limit, page };
}

import type {
  Person,
  PersonListEnvelope,
  VolunteerListEnvelope,
  PeopleCountsOut,
} from "@/api-types";
import { fetchJsonOrThrow } from "../api/adminApi";
import { m } from "@/paraglide/messages";

export interface PeopleListParams {
  page: number;
  limit: number;
  q?: string;
  sort?: "name" | "email" | "created" | "updated" | "registration_count" | "last_attended";
  sort_dir?: "asc" | "desc";
  role?: string;
  active?: boolean;
  reward_due?: boolean;
}

export type PeoplePage = Omit<PersonListEnvelope, "items"> & { items: Person[] };

/** Only the list contract is accepted: unsupported predicates must not be ignored. */
export function peopleListSearchParams(params: PeopleListParams): URLSearchParams {
  const allowed = ["page", "limit", "q", "sort", "sort_dir", "role", "active", "reward_due"];
  for (const key of Object.keys(params)) {
    if (!allowed.includes(key)) throw new Error(`Unsupported people list parameter: ${key}`);
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search;
}

export async function fetchPeoplePage(
  params: PeopleListParams,
  signal: AbortSignal,
): Promise<PeoplePage> {
  // Volunteers use their own endpoint so help periods belong to this bounded page.
  const path = params.role === "volunteer" ? "/api/volunteers" : "/api/people";
  const search = peopleListSearchParams(params);
  if (path === "/api/volunteers") {
    search.delete("role");
    if (params.sort === "email" || params.sort === "registration_count") {
      throw new Error(`Unsupported volunteer sort: ${params.sort}`);
    }
  }
  const payload = await fetchJsonOrThrow<PersonListEnvelope | VolunteerListEnvelope>(
    `${path}?${search}`,
    { signal },
    m.admin_error_load_data(),
  );
  signal.throwIfAborted();
  if (
    !Array.isArray(payload.items) ||
    !Number.isInteger(payload.total) ||
    !Number.isInteger(payload.page) ||
    !Number.isInteger(payload.limit)
  ) {
    throw new Error("Invalid people page: expected {items, total, page, limit}.");
  }
  return payload;
}

export type PeopleCountParams = Pick<PeopleListParams, "q" | "role" | "active" | "reward_due">;
export type PeopleCounts = PeopleCountsOut;

/** Full-result facets, independent of the currently visible page. */
export function fetchPeopleCounts(
  params: PeopleCountParams,
  signal: AbortSignal,
): Promise<PeopleCounts> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!["q", "role", "active", "reward_due"].includes(key)) {
      throw new Error(`Unsupported people counts parameter: ${key}`);
    }
    if (value !== undefined) search.set(key, String(value));
  }
  return fetchJsonOrThrow(`/api/people/counts?${search}`, { signal }, m.admin_error_load_data());
}

export async function fetchPeopleByEmail(
  email: string,
  excludePersonId: string,
  signal: AbortSignal,
): Promise<PeoplePage> {
  const search = new URLSearchParams({
    email,
    exclude_person_id: excludePersonId,
    limit: "100",
    page: "1",
  });
  const page = await fetchJsonOrThrow<PersonListEnvelope>(
    `/api/people/by-email?${search}`,
    { signal },
    m.admin_error_load_data(),
  );
  signal.throwIfAborted();
  return page;
}

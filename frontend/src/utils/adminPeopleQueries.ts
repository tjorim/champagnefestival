import { apiToPerson, type Person } from "@/types/person";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { m } from "@/paraglide/messages";

export interface PeopleListParams {
  page: number;
  limit: number;
  q?: string;
  sort?: "name" | "email" | "created" | "updated" | "registration_count";
  sort_dir?: "asc" | "desc";
  role?: string;
  active?: boolean;
}

export interface PeoplePage {
  items: (Person & { registrationCount?: number })[];
  total: number;
  page: number;
  limit: number;
}

/** Only the list contract is accepted: unsupported predicates must not be ignored. */
export function peopleListSearchParams(params: PeopleListParams): URLSearchParams {
  const allowed = ["page", "limit", "q", "sort", "sort_dir", "role", "active"];
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
  authHeaders: () => Record<string, string>,
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
  const payload = await fetchJsonOrThrowWithUnauthorized<{
    items: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
  }>(`${path}?${search}`, { headers: authHeaders(), signal }, m.admin_error_load_data());
  signal.throwIfAborted();
  if (
    !Array.isArray(payload.items) ||
    !Number.isInteger(payload.total) ||
    !Number.isInteger(payload.page) ||
    !Number.isInteger(payload.limit)
  ) {
    throw new Error("Invalid people page: expected {items, total, page, limit}.");
  }
  return {
    ...payload,
    items: payload.items.map((item) => ({
      ...apiToPerson(item),
      registrationCount:
        typeof item.registration_count === "number" ? item.registration_count : undefined,
    })),
  };
}

export type PeopleCountParams = Pick<PeopleListParams, "q" | "role" | "active">;
export interface PeopleCounts {
  total: number;
  active: number;
  inactive: number;
  by_role: Record<string, number>;
}

/** Full-result facets, independent of the currently visible page. */
export function fetchPeopleCounts(
  authHeaders: () => Record<string, string>,
  params: PeopleCountParams,
  signal: AbortSignal,
): Promise<PeopleCounts> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!["q", "role", "active"].includes(key)) {
      throw new Error(`Unsupported people counts parameter: ${key}`);
    }
    if (value !== undefined) search.set(key, String(value));
  }
  return fetchJsonOrThrowWithUnauthorized(
    `/api/people/counts?${search}`,
    { headers: authHeaders(), signal },
    m.admin_error_load_data(),
  );
}

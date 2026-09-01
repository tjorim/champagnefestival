import type {
  Room,
  FloorTable,
  FloorArea,
  TableType,
  Layout,
  Venue,
  AuditEntry,
  EditionAttendanceStats,
  EventCheckInStats,
  FaqItem,
} from "@/types/admin";
import { apiToRegistration } from "@/types/registrationMapper";
import type { Registration } from "@/types/registration";
import { type Person, apiToPerson } from "@/types/person";
import {
  downloadFileOrThrow,
  fetchArrayOrThrow,
  fetchJsonOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { m } from "@/paraglide/messages";
import { devError } from "@/utils/devLog";
import {
  apiVenueToVenue,
  apiLayoutToLayout,
  apiTableTypeToTableType,
  apiRoomToRoom,
  apiTableToTable,
  apiAreaToArea,
  apiAuditEntryToAuditEntry,
  apiEditionStatsToEditionAttendanceStats,
  apiEventCheckInStatsToEventCheckInStats,
  apiFaqItemToFaqItem,
  mergePeopleWithVolunteers,
} from "@/utils/adminApiMappers";

export interface RegistrationsPage {
  registrations: Registration[];
  total: number;
  limit: number;
  page: number;
}

interface RegistrationListEnvelope {
  items?: Record<string, unknown>[];
  total?: number;
  limit?: number;
  page?: number;
}

export type RegistrationSortKey =
  | "name"
  | "event"
  | "guest_count"
  | "status"
  | "payment_status"
  | "checked_in";

export interface RegistrationsPageOptions {
  query?: string;
  status?: string;
  eventId?: string;
  tableId?: string;
  personId?: string;
  editionId?: string;
  editionType?: string;
  editionCategory?: "festival" | "standalone";
  /** ISO calendar date (YYYY-MM-DD), matched against the event's date. */
  eventDate?: string;
  sort?: RegistrationSortKey;
  sortDir?: "asc" | "desc";
  limit?: number;
  page?: number;
}

/**
 * Fetch one page of the admin registration list. Mirrors every filter/sort
 * `GET /api/registrations` supports (see backend/app/routers/registrations.py)
 * so the table can paginate server-side instead of holding the full dataset.
 */
export async function fetchRegistrationsPage(
  authHeaders: () => Record<string, string>,
  options: RegistrationsPageOptions = {},
): Promise<RegistrationsPage> {
  const params = new URLSearchParams();
  const trimmedQuery = options.query?.trim();
  if (trimmedQuery) params.set("q", trimmedQuery);
  if (options.status) params.set("status", options.status);
  if (options.eventId) params.set("event_id", options.eventId);
  if (options.tableId) params.set("table_id", options.tableId);
  if (options.personId) params.set("person_id", options.personId);
  if (options.editionId) params.set("edition_id", options.editionId);
  if (options.editionType) params.set("edition_type", options.editionType);
  if (options.editionCategory) params.set("edition_category", options.editionCategory);
  if (options.eventDate) params.set("event_date", options.eventDate);
  if (options.sort) params.set("sort", options.sort);
  if (options.sortDir) params.set("sort_dir", options.sortDir);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.page) params.set("page", String(options.page));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJsonOrThrowWithUnauthorized<RegistrationListEnvelope>(
    `/api/registrations${suffix}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  if (
    !Array.isArray(payload.items) ||
    typeof payload.total !== "number" ||
    typeof payload.limit !== "number" ||
    typeof payload.page !== "number"
  ) {
    // A bare array (the old, pre-#931 shape) or any other malformed response
    // must not be swallowed into an empty/zero-valued page — that would look
    // exactly like the silent-truncation bug this endpoint was fixed for.
    throw new Error("Invalid /api/registrations response: expected {items, total, limit, page}.");
  }
  return {
    registrations: payload.items.map(apiToRegistration),
    total: payload.total,
    limit: payload.limit,
    page: payload.page,
  };
}

// LayoutEditor's floor-plan occupancy and the dashboard's status/edition/capacity
// aggregates genuinely need the complete working set (they summarize across every
// registration, not one page of it) — same reasoning as fetchPeople's full pull
// below. ADMIN_REGISTRATIONS_FULL_LIST_LIMIT mirrors backend/app/routers/registrations.py's
// Pagination ceiling so the request is bounded (not literally unlimited) while
// still covering any realistic guest list. The registrations *table* itself does
// not use this — see fetchRegistrationsPage, used directly by RegistrationList.
export const ADMIN_REGISTRATIONS_FULL_LIST_LIMIT = 1000;

export async function fetchAllRegistrations(
  authHeaders: () => Record<string, string>,
): Promise<Registration[]> {
  const { registrations, total } = await fetchRegistrationsPage(authHeaders, {
    limit: ADMIN_REGISTRATIONS_FULL_LIST_LIMIT,
  });
  if (total > registrations.length) {
    devError(
      `Admin registrations dashboard is showing ${registrations.length} of ${total} registrations; ` +
        "raise ADMIN_REGISTRATIONS_FULL_LIST_LIMIT or add server-side pagination to the admin table.",
    );
  }
  return registrations;
}

export async function fetchRegistration(
  registrationId: string,
  authHeaders: () => Record<string, string>,
): Promise<Registration> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/registrations/${encodeURIComponent(registrationId)}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return apiToRegistration(payload);
}

export async function fetchTables(
  authHeaders: () => Record<string, string>,
): Promise<FloorTable[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/tables",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiTableToTable) : [];
}

export async function fetchVenues(authHeaders: () => Record<string, string>): Promise<Venue[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/venues",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiVenueToVenue) : [];
}

export async function fetchRooms(authHeaders: () => Record<string, string>): Promise<Room[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/rooms",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiRoomToRoom) : [];
}

export async function fetchTableTypes(
  authHeaders: () => Record<string, string>,
): Promise<TableType[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/table-types",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiTableTypeToTableType) : [];
}

export async function fetchLayouts(authHeaders: () => Record<string, string>): Promise<Layout[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/layouts",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiLayoutToLayout) : [];
}

export async function fetchExhibitors(
  authHeaders: () => Record<string, string>,
): Promise<{ id: number; name: string; active: boolean; contactPersonId: string | null }[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/exhibitors",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload)
    ? payload.map((exhibitor: Record<string, unknown>) => ({
        id: Number(exhibitor.id),
        name: String(exhibitor.name ?? ""),
        active: exhibitor.active !== false,
        contactPersonId:
          typeof exhibitor.contact_person_id === "string" ? exhibitor.contact_person_id : null,
      }))
    : [];
}

export async function fetchAreas(authHeaders: () => Record<string, string>): Promise<FloorArea[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/areas",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiAreaToArea) : [];
}

interface PersonListEnvelope {
  items?: Record<string, unknown>[];
  total?: number;
  limit?: number;
  page?: number;
}

// GET /api/people and /api/volunteers page like GET /api/registrations (see
// backend/app/routers/{people,volunteers}.py) — {items, total, limit, page}.
// GET /api/members doesn't exist (retired — it was functionally identical to
// /api/people?role=member; see backend/app/routers/members.py), so the
// member list is read through /api/people?role=member instead. Unlike the
// registrations table, the People/Volunteers/Members admin tabs are still
// full client-side tables (see PeopleManagement/VolunteersManagement/
// MembersManagement), so instead of real server-side pagination we fetch one
// bounded "everything" page and warn loudly if it was ever truncated,
// mirroring fetchAllRegistrations.
export const PEOPLE_FULL_LIST_LIMIT = 1000;

async function fetchPersonListEnvelope(
  url: string,
  authHeaders: () => Record<string, string>,
): Promise<{ people: Person[]; total: number }> {
  const payload = await fetchJsonOrThrowWithUnauthorized<PersonListEnvelope>(
    url,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  if (
    !Array.isArray(payload.items) ||
    typeof payload.total !== "number" ||
    typeof payload.limit !== "number" ||
    typeof payload.page !== "number"
  ) {
    // A bare array (the old, pre-envelope shape) or any other malformed
    // response must not be swallowed into an empty/zero-valued list — that
    // would look exactly like the silent-truncation bug this endpoint was
    // fixed for (see #931).
    throw new Error(`Invalid ${url} response: expected {items, total, limit, page}.`);
  }
  return { people: payload.items.map(apiToPerson), total: payload.total };
}

function warnIfPersonListTruncated(label: string, count: number, total: number): void {
  if (total > count) {
    devError(
      `Admin ${label} fetch is showing ${count} of ${total}; raise PEOPLE_FULL_LIST_LIMIT or add server-side pagination.`,
    );
  }
}

export async function fetchPeopleSearch(
  authHeaders: () => Record<string, string>,
  query: string,
): Promise<Person[]> {
  const [peopleResult, volunteersResult] = await Promise.all([
    fetchPersonListEnvelope(
      `/api/people?q=${encodeURIComponent(query.trim())}&limit=${PEOPLE_FULL_LIST_LIMIT}`,
      authHeaders,
    ),
    fetchPersonListEnvelope(`/api/volunteers?limit=${PEOPLE_FULL_LIST_LIMIT}`, authHeaders),
  ]);
  warnIfPersonListTruncated("people search", peopleResult.people.length, peopleResult.total);
  warnIfPersonListTruncated("volunteers", volunteersResult.people.length, volunteersResult.total);
  return mergePeopleWithVolunteers(peopleResult.people, volunteersResult.people);
}

export async function fetchPeople(authHeaders: () => Record<string, string>): Promise<Person[]> {
  const [peopleResult, volunteersResult] = await Promise.all([
    fetchPersonListEnvelope(`/api/people?limit=${PEOPLE_FULL_LIST_LIMIT}`, authHeaders),
    fetchPersonListEnvelope(`/api/volunteers?limit=${PEOPLE_FULL_LIST_LIMIT}`, authHeaders),
  ]);
  warnIfPersonListTruncated("people", peopleResult.people.length, peopleResult.total);
  warnIfPersonListTruncated("volunteers", volunteersResult.people.length, volunteersResult.total);
  return mergePeopleWithVolunteers(peopleResult.people, volunteersResult.people);
}

export async function fetchMembers(authHeaders: () => Record<string, string>): Promise<Person[]> {
  const result = await fetchPersonListEnvelope(
    `/api/people?role=member&limit=${PEOPLE_FULL_LIST_LIMIT}`,
    authHeaders,
  );
  warnIfPersonListTruncated("members", result.people.length, result.total);
  return result.people;
}

export interface AuditEntryFilters {
  resourceType?: string;
  resourceId?: string;
  actor?: string;
  action?: string;
  /** Inclusive lower bound, ISO-8601. */
  since?: string;
  /** Inclusive upper bound, ISO-8601. */
  until?: string;
  limit?: number;
  page?: number;
}

export async function fetchAuditEntries(
  authHeaders: () => Record<string, string>,
  filters: AuditEntryFilters = {},
): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (filters.resourceType) params.set("resource_type", filters.resourceType);
  if (filters.resourceId) params.set("resource_id", filters.resourceId);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  params.set("limit", String(filters.limit ?? 50));
  params.set("page", String(filters.page ?? 1));

  return fetchArrayOrThrow(
    `/api/audit?${params.toString()}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiAuditEntryToAuditEntry,
  );
}

export async function fetchAuditResourceTypes(
  authHeaders: () => Record<string, string>,
): Promise<string[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<string[]>(
    "/api/audit/resource-types",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload : [];
}

/**
 * Per-event check-in progress, counted by the backend rather than from whatever
 * registrations the client happens to hold. Optionally scoped to one edition.
 */
export async function fetchEventCheckInStats(
  authHeaders: () => Record<string, string>,
  editionId?: string,
): Promise<EventCheckInStats[]> {
  const suffix = editionId ? `?edition_id=${encodeURIComponent(editionId)}` : "";
  return fetchArrayOrThrow(
    `/api/events/checkin-stats${suffix}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiEventCheckInStatsToEventCheckInStats,
  );
}

export async function fetchEditionStats(
  authHeaders: () => Record<string, string>,
): Promise<EditionAttendanceStats[]> {
  return fetchArrayOrThrow(
    "/api/editions/stats",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiEditionStatsToEditionAttendanceStats,
  );
}

export async function fetchFaqItemsAdmin(
  authHeaders: () => Record<string, string>,
): Promise<FaqItem[]> {
  return fetchArrayOrThrow(
    "/api/faq",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiFaqItemToFaqItem,
  );
}

export async function downloadRegistrationsCsv(
  authHeaders: () => Record<string, string>,
  eventId: string,
): Promise<void> {
  await downloadFileOrThrow(
    `/api/registrations/export?event_id=${encodeURIComponent(eventId)}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
    "guest-list.csv",
  );
}

export async function downloadVolunteersCsv(
  authHeaders: () => Record<string, string>,
): Promise<void> {
  await downloadFileOrThrow(
    "/api/volunteers/export",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    "volunteers-insurance-list.csv",
  );
}

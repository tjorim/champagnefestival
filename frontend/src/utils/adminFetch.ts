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

async function fetchRegistrationsPage(
  authHeaders: () => Record<string, string>,
  options: { query?: string; limit?: number } = {},
): Promise<RegistrationsPage> {
  const params = new URLSearchParams();
  const trimmedQuery = options.query?.trim();
  if (trimmedQuery) params.set("q", trimmedQuery);
  if (options.limit) params.set("limit", String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJsonOrThrowWithUnauthorized<RegistrationListEnvelope>(
    `/api/registrations${suffix}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return {
    registrations: Array.isArray(payload.items) ? payload.items.map(apiToRegistration) : [],
    total: payload.total ?? 0,
    limit: payload.limit ?? 0,
    page: payload.page ?? 1,
  };
}

// The admin dashboard needs the full working set for client-side filtering,
// sorting, and aggregate stats (status/edition counts, per-event capacity),
// not one page of it — same reasoning as fetchPeople's full pull below. This
// mirrors backend/app/routers/registrations.py's Pagination ceiling so the
// request is bounded (not literally unlimited) while still covering any
// realistic guest list.
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

/** Admin registration search: returns `total` alongside the (possibly truncated) page of matches. */
export async function fetchRegistrationsSearch(
  authHeaders: () => Record<string, string>,
  query: string,
): Promise<RegistrationsPage> {
  return fetchRegistrationsPage(authHeaders, { query });
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

// NOTE: /api/people and /api/volunteers both support optional limit/page pagination,
// but we intentionally fetch all records here because client-side deduplication
// (mergePeopleWithVolunteers) requires the full dataset.
export async function fetchPeopleSearch(
  authHeaders: () => Record<string, string>,
  query: string,
): Promise<Person[]> {
  const [peoplePayload, volunteers] = await Promise.all([
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      `/api/people?q=${encodeURIComponent(query.trim())}`,
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchArrayOrThrow(
      "/api/volunteers",
      { headers: authHeaders() },
      m.admin_error_load_data(),
      apiToPerson,
    ),
  ]);
  const nextPeople = Array.isArray(peoplePayload) ? peoplePayload.map(apiToPerson) : [];
  return mergePeopleWithVolunteers(nextPeople, volunteers);
}

export async function fetchPeople(authHeaders: () => Record<string, string>): Promise<Person[]> {
  const [peoplePayload, volunteers] = await Promise.all([
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/people",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchArrayOrThrow(
      "/api/volunteers",
      { headers: authHeaders() },
      m.admin_error_load_data(),
      apiToPerson,
    ),
  ]);
  const nextPeople = Array.isArray(peoplePayload) ? peoplePayload.map(apiToPerson) : [];
  return mergePeopleWithVolunteers(nextPeople, volunteers);
}

export async function fetchMembers(authHeaders: () => Record<string, string>): Promise<Person[]> {
  return fetchArrayOrThrow(
    "/api/members",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiToPerson,
  );
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

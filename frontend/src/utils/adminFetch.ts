import type {
  Room,
  FloorTable,
  FloorArea,
  TableType,
  Layout,
  Venue,
  AuditEntry,
  EditionAttendanceStats,
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
import {
  apiVenueToVenue,
  apiLayoutToLayout,
  apiTableTypeToTableType,
  apiRoomToRoom,
  apiTableToTable,
  apiAreaToArea,
  apiAuditEntryToAuditEntry,
  apiEditionStatsToEditionAttendanceStats,
  mergePeopleWithVolunteers,
} from "@/utils/adminApiMappers";

export async function fetchRegistrations(
  authHeaders: () => Record<string, string>,
  query?: string,
): Promise<Registration[]> {
  const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    `/api/registrations${suffix}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiToRegistration) : [];
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

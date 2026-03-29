import type { Room, FloorTable, FloorArea, TableType, Layout, Venue } from "@/types/admin";
import { apiToRegistration } from "@/types/registrationMapper";
import type { Registration } from "@/types/registration";
import { type Person, apiToPerson } from "@/types/person";
import {
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
  mergePeopleWithVolunteers,
} from "@/utils/adminApiMappers";

export async function fetchRegistrations(
  authHeaders: () => Record<string, string>,
): Promise<Registration[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/registrations",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiToRegistration) : [];
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

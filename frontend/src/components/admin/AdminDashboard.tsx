import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Container from "react-bootstrap/Container";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Tab from "react-bootstrap/Tab";
import Nav from "react-bootstrap/Nav";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import RegistrationList from "./RegistrationList";
import RegistrationDetail from "./RegistrationDetail";
import LayoutEditor from "./LayoutEditor";
import TableTypeManagement from "./TableTypeManagement";
import VenueManagement from "./VenueManagement";
import ContentManagement from "./ContentManagement";
import type { Event } from "@/types/event";
import { apiToEvent } from "@/types/event";
import type { ItemDraft } from "./itemTypes";
import PeopleManagement from "./PeopleManagement";
import MembersManagement from "./MembersManagement";
import VolunteersManagement from "./VolunteersManagement";
import type { MemberFormData } from "./MemberFormModal";
import type { PersonFormData } from "./PersonFormModal";
import type { VolunteerFormData } from "./VolunteerFormModal";
import type {
  Registration,
  RegistrationStatus,
  PaymentStatus,
  OrderItem,
} from "@/types/registration";
import { apiToRegistration } from "@/types/registrationMapper";
import type { Room, FloorTable, FloorArea, TableType, Layout, Venue } from "@/types/admin";
import { type Person, apiToPerson } from "@/types/person";
import { activeEditionQueryKey, useActiveEdition } from "@/hooks/useActiveEdition";
import {
  fetchArrayOrThrow,
  fetchJsonOrThrowWithUnauthorized,
  fetchStatus,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";

interface AdminDashboardProps {
  visible: boolean;
}

/** Map FastAPI snake_case venue response to frontend camelCase Venue type */
function apiVenueToVenue(d: Record<string, unknown>): Venue {
  return {
    id: d.id as string,
    name: d.name as string,
    address: (d.address ?? "") as string,
    city: (d.city ?? "") as string,
    postalCode: (d.postal_code ?? "") as string,
    country: (d.country ?? "") as string,
    lat: (d.lat ?? 0) as number,
    lng: (d.lng ?? 0) as number,
    active: (d.active ?? true) as boolean,
  };
}

/** Map FastAPI snake_case layout response to frontend camelCase Layout type */
function apiLayoutToLayout(d: Record<string, unknown>): Layout {
  return {
    id: d.id as string,
    editionId: (d.edition_id as string | null) ?? null,
    roomId: d.room_id as string,
    date: (d.date as string | null) ?? null,
    label: (d.label ?? "") as string,
    createdAt: d.created_at as string,
  };
}

/** Map FastAPI snake_case table type response to frontend camelCase TableType type */
function apiTableTypeToTableType(d: Record<string, unknown>): TableType {
  return {
    id: d.id as string,
    name: d.name as string,
    shape: (d.shape ?? "rectangle") as "rectangle" | "round",
    widthM: (d.width_m ?? 1.8) as number,
    lengthM: (d.length_m ?? 0.7) as number,
    heightType: (d.height_type ?? "low") as "low" | "high",
    maxCapacity: (d.max_capacity ?? 4) as number,
    active: (d.active ?? true) as boolean,
  };
}

/** Map FastAPI snake_case room response to frontend camelCase Room type */
function apiRoomToRoom(d: Record<string, unknown>): Room {
  return {
    id: d.id as string,
    venueId: d.venue_id as string,
    name: d.name as string,
    widthM: d.width_m as number,
    lengthM: d.length_m as number,
    color: d.color as string,
    active: (d.active ?? true) as boolean,
  };
}

/** Map FastAPI snake_case table response to frontend camelCase Table type */
function apiTableToTable(d: Record<string, unknown>): FloorTable {
  return {
    id: d.id as string,
    name: d.name as string,
    capacity: d.capacity as number,
    x: d.x as number,
    y: d.y as number,
    tableTypeId: d.table_type_id as string,
    rotation: (d.rotation ?? 0) as number,
    layoutId: d.layout_id as string,
    registrationIds: (d.registration_ids as string[]) ?? [],
  };
}

/** Map FastAPI snake_case area response to frontend camelCase FloorArea type */
function apiAreaToArea(d: Record<string, unknown>): FloorArea {
  return {
    id: d.id as string,
    layoutId: d.layout_id as string,
    icon: (d.icon ?? "bi-shop") as string,
    exhibitorId: (d.exhibitor_id as number | null) ?? null,
    label: (d.label ?? "") as string,
    x: (d.x ?? 50) as number,
    y: (d.y ?? 50) as number,
    rotation: (d.rotation ?? 0) as number,
    widthM: (d.width_m ?? 1.5) as number,
    lengthM: (d.length_m ?? 1.0) as number,
  };
}

function mergeVolunteerPerson(existing: Person | undefined, volunteer: Person): Person {
  const roles = new Set(existing?.roles ?? volunteer.roles);
  roles.add("volunteer");
  return {
    ...(existing ?? volunteer),
    ...volunteer,
    email: existing?.email ?? volunteer.email,
    phone: existing?.phone ?? volunteer.phone,
    visitsPerMonth: existing?.visitsPerMonth ?? volunteer.visitsPerMonth,
    clubName: existing?.clubName ?? volunteer.clubName,
    notes: existing?.notes ?? volunteer.notes,
    roles: [...roles],
    helpPeriods: volunteer.helpPeriods,
  };
}

function mergePeopleWithVolunteers(people: Person[], volunteers: Person[]): Person[] {
  const volunteerById = new Map(volunteers.map((volunteer) => [volunteer.id, volunteer]));
  const mergedPeople = people.map((person) => {
    const volunteer = volunteerById.get(person.id);
    return volunteer ? mergeVolunteerPerson(person, volunteer) : person;
  });

  const knownIds = new Set(mergedPeople.map((person) => person.id));
  const volunteerOnly = volunteers
    .filter((volunteer) => !knownIds.has(volunteer.id))
    .map((volunteer) => mergeVolunteerPerson(undefined, volunteer));

  return [...mergedPeople, ...volunteerOnly];
}

function mergePersonUpdate(existing: Person | undefined, updated: Person): Person {
  if (!existing) {
    return updated;
  }

  if (!updated.roles.includes("volunteer")) {
    return updated;
  }

  return {
    ...updated,
    helpPeriods: existing.helpPeriods,
  };
}

function replacePersonById(people: Person[], updated: Person): Person[] {
  return people.map((person) =>
    person.id === updated.id ? mergePersonUpdate(person, updated) : person,
  );
}

function replaceVolunteerById(people: Person[], updatedVolunteer: Person): Person[] {
  return people.map((person) =>
    person.id === updatedVolunteer.id ? mergeVolunteerPerson(person, updatedVolunteer) : person,
  );
}

function syncMembersWithPerson(members: Person[], person: Person): Person[] {
  if (!person.roles.includes("member")) {
    return members.filter((member) => member.id !== person.id);
  }

  const hasMember = members.some((member) => member.id === person.id);
  if (!hasMember) {
    return [person, ...members];
  }

  return members.map((member) => (member.id === person.id ? person : member));
}

async function fetchRegistrations(
  authHeaders: () => Record<string, string>,
): Promise<Registration[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/registrations",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiToRegistration) : [];
}

async function fetchTables(authHeaders: () => Record<string, string>): Promise<FloorTable[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/tables",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiTableToTable) : [];
}

async function fetchVenues(authHeaders: () => Record<string, string>): Promise<Venue[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/venues",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiVenueToVenue) : [];
}

async function fetchEvents(authHeaders: () => Record<string, string>): Promise<Event[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/events",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiToEvent) : [];
}

async function fetchRooms(authHeaders: () => Record<string, string>): Promise<Room[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/rooms",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiRoomToRoom) : [];
}

async function fetchTableTypes(authHeaders: () => Record<string, string>): Promise<TableType[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/table-types",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiTableTypeToTableType) : [];
}

async function fetchLayouts(authHeaders: () => Record<string, string>): Promise<Layout[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/layouts",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiLayoutToLayout) : [];
}

async function fetchExhibitors(
  authHeaders: () => Record<string, string>,
): Promise<{ id: number; name: string; active: boolean; contactPersonId: string | null }[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/exhibitors",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload)
    ? payload.map((exhibitor: Record<string, unknown>) => ({
        id: exhibitor.id as number,
        name: exhibitor.name as string,
        active: (exhibitor.active ?? true) as boolean,
        contactPersonId: (exhibitor.contact_person_id as string | null) ?? null,
      }))
    : [];
}

async function fetchAreas(authHeaders: () => Record<string, string>): Promise<FloorArea[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/areas",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiAreaToArea) : [];
}

async function fetchPeople(authHeaders: () => Record<string, string>): Promise<Person[]> {
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

async function fetchMembers(authHeaders: () => Record<string, string>): Promise<Person[]> {
  return fetchArrayOrThrow(
    "/api/members",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiToPerson,
  );
}

export default function AdminDashboard({ visible }: AdminDashboardProps) {
  const { edition: activeEdition } = useActiveEdition();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const storedTokenRef = useRef(sessionStorage.getItem("adminToken") ?? "");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const autoAuthRan = useRef(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | RegistrationStatus>("all");
  /** Full registration (with checkInToken) shown in the detail modal */
  const [detailRegistration, setDetailRegistration] = useState<Registration | null>(null);

  const authHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${storedTokenRef.current}`,
    }),
    [],
  );

  // Per-resource query keys (recomputed on each render; storedTokenRef.current is stable
  // between renders but updated before the state change that triggers re-render on login/logout)
  const registrationsQueryKey = queryKeys.admin.registrations(storedTokenRef.current);
  const tablesQueryKey = queryKeys.admin.tables(storedTokenRef.current);
  const venuesQueryKey = queryKeys.admin.venues(storedTokenRef.current);
  const eventsQueryKey = queryKeys.admin.events(storedTokenRef.current);
  const roomsQueryKey = queryKeys.admin.rooms(storedTokenRef.current);
  const tableTypesQueryKey = queryKeys.admin.tableTypes(storedTokenRef.current);
  const layoutsQueryKey = queryKeys.admin.layouts(storedTokenRef.current);
  const exhibitorsQueryKey = queryKeys.admin.exhibitors(storedTokenRef.current);
  const areasQueryKey = queryKeys.admin.areas(storedTokenRef.current);
  const peopleQueryKey = queryKeys.admin.people(storedTokenRef.current);
  const membersQueryKey = queryKeys.admin.members(storedTokenRef.current);

  const queryOptions = {
    enabled: visible && isAuthenticated,
    staleTime: 60 * 1000,
    retry: false as const,
  };

  const registrationsQuery = useQuery({
    queryKey: registrationsQueryKey,
    queryFn: () => fetchRegistrations(authHeaders),
    ...queryOptions,
  });
  const tablesQuery = useQuery({
    queryKey: tablesQueryKey,
    queryFn: () => fetchTables(authHeaders),
    ...queryOptions,
  });
  const venuesQuery = useQuery({
    queryKey: venuesQueryKey,
    queryFn: () => fetchVenues(authHeaders),
    ...queryOptions,
  });
  const eventsQuery = useQuery({
    queryKey: eventsQueryKey,
    queryFn: () => fetchEvents(authHeaders),
    ...queryOptions,
  });
  const roomsQuery = useQuery({
    queryKey: roomsQueryKey,
    queryFn: () => fetchRooms(authHeaders),
    ...queryOptions,
  });
  const tableTypesQuery = useQuery({
    queryKey: tableTypesQueryKey,
    queryFn: () => fetchTableTypes(authHeaders),
    ...queryOptions,
  });
  const layoutsQuery = useQuery({
    queryKey: layoutsQueryKey,
    queryFn: () => fetchLayouts(authHeaders),
    ...queryOptions,
  });
  const exhibitorsQuery = useQuery({
    queryKey: exhibitorsQueryKey,
    queryFn: () => fetchExhibitors(authHeaders),
    ...queryOptions,
  });
  const areasQuery = useQuery({
    queryKey: areasQueryKey,
    queryFn: () => fetchAreas(authHeaders),
    ...queryOptions,
  });
  const peopleQuery = useQuery({
    queryKey: peopleQueryKey,
    queryFn: () => fetchPeople(authHeaders),
    ...queryOptions,
  });
  const membersQuery = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => fetchMembers(authHeaders),
    ...queryOptions,
  });

  const registrations = registrationsQuery.data ?? [];
  const tables = tablesQuery.data ?? [];
  const venues = venuesQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const tableTypes = tableTypesQuery.data ?? [];
  const layouts = layoutsQuery.data ?? [];
  const exhibitors = exhibitorsQuery.data ?? [];
  const areas = areasQuery.data ?? [];
  const people = peopleQuery.data ?? [];
  const members = membersQuery.data ?? [];

  const isAnyPending =
    registrationsQuery.isPending ||
    tablesQuery.isPending ||
    venuesQuery.isPending ||
    eventsQuery.isPending ||
    roomsQuery.isPending ||
    tableTypesQuery.isPending ||
    layoutsQuery.isPending ||
    exhibitorsQuery.isPending ||
    areasQuery.isPending ||
    peopleQuery.isPending ||
    membersQuery.isPending;

  const isAnyFetching =
    registrationsQuery.isFetching ||
    tablesQuery.isFetching ||
    venuesQuery.isFetching ||
    eventsQuery.isFetching ||
    roomsQuery.isFetching ||
    tableTypesQuery.isFetching ||
    layoutsQuery.isFetching ||
    exhibitorsQuery.isFetching ||
    areasQuery.isFetching ||
    peopleQuery.isFetching ||
    membersQuery.isFetching;

  const layoutDayOptions = useMemo(() => {
    const uniqueDates = [...new Set(activeEdition.events.map((event) => event.date))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return uniqueDates.map((date) => ({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    }));
  }, [activeEdition.events]);

  const loadData = useCallback(async () => {
    setError("");
    await Promise.all([
      registrationsQuery.refetch(),
      tablesQuery.refetch(),
      venuesQuery.refetch(),
      eventsQuery.refetch(),
      roomsQuery.refetch(),
      tableTypesQuery.refetch(),
      layoutsQuery.refetch(),
      exhibitorsQuery.refetch(),
      areasQuery.refetch(),
      peopleQuery.refetch(),
      membersQuery.refetch(),
    ]);
  }, [
    registrationsQuery,
    tablesQuery,
    venuesQuery,
    eventsQuery,
    roomsQuery,
    tableTypesQuery,
    layoutsQuery,
    exhibitorsQuery,
    areasQuery,
    peopleQuery,
    membersQuery,
  ]);

  const mergePeopleMutation = useMutation({
    mutationFn: ({ canonicalId, duplicateId }: { canonicalId: string; duplicateId: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/people/${canonicalId}/merge/${duplicateId}`,
        { method: "POST", headers: authHeaders() },
        m.admin_people_merge_error(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
        queryClient.invalidateQueries({ queryKey: registrationsQueryKey }),
        queryClient.invalidateQueries({ queryKey: exhibitorsQueryKey }),
      ]);
    },
    retry: false,
  });

  const createMemberMutation = useMutation({
    mutationFn: (data: MemberFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/members",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            address: data.address,
            club_name: data.clubName,
            notes: data.notes,
            active: data.active,
          }),
        },
        m.admin_members_error_create(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
      ]);
    },
    retry: false,
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: MemberFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/members/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            address: data.address,
            club_name: data.clubName,
            notes: data.notes,
            active: data.active,
          }),
        },
        m.admin_members_error_update(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
        queryClient.invalidateQueries({ queryKey: registrationsQueryKey }),
      ]);
    },
    retry: false,
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/members/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_members_error_delete(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
      ]);
    },
    retry: false,
  });

  const createPersonMutation = useMutation({
    mutationFn: (data: PersonFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/people",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            address: data.address,
            roles: data.roles,
            notes: data.notes,
            club_name: data.clubName,
            active: data.active,
          }),
        },
        m.admin_people_error_create(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
      ]);
    },
    retry: false,
  });

  const updatePersonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PersonFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/people/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            address: data.address,
            roles: data.roles,
            notes: data.notes,
            club_name: data.clubName,
            active: data.active,
          }),
        },
        m.admin_people_error_update(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
        queryClient.invalidateQueries({ queryKey: registrationsQueryKey }),
      ]);
    },
    retry: false,
  });

  const deletePersonMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/people/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_person(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
      ]);
    },
    retry: false,
  });

  const createVolunteerMutation = useMutation({
    mutationFn: (data: VolunteerFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/volunteers",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            address: data.address,
            national_register_number: data.nationalRegisterNumber,
            eid_document_number: data.eidDocumentNumber,
            active: data.active,
            help_periods: data.helpPeriods.map((period) => ({
              first_help_day: period.firstHelpDay,
              last_help_day: period.lastHelpDay,
            })),
          }),
        },
        m.admin_volunteers_error_create(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
    },
    retry: false,
  });

  const updateVolunteerMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: VolunteerFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/volunteers/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            address: data.address,
            national_register_number: data.nationalRegisterNumber,
            eid_document_number: data.eidDocumentNumber,
            active: data.active,
            help_periods: data.helpPeriods.map((period) => ({
              first_help_day: period.firstHelpDay,
              last_help_day: period.lastHelpDay,
            })),
          }),
        },
        m.admin_volunteers_error_update(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
      ]);
    },
    retry: false,
  });

  const deleteVolunteerMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/volunteers/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_volunteers_error_delete(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
    },
    retry: false,
  });

  const updateRegistrationMutation = useMutation({
    mutationFn: ({
      id,
      payload,
      fallbackMessage,
    }: {
      id: string;
      payload: Record<string, unknown>;
      fallbackMessage: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/registrations/${id}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) },
        fallbackMessage,
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: registrationsQueryKey }),
        queryClient.invalidateQueries({ queryKey: tablesQueryKey }),
      ]);
    },
    retry: false,
  });

  const createTableMutation = useMutation({
    mutationFn: ({
      name,
      capacity,
      layoutId,
      tableTypeId,
    }: {
      name: string;
      capacity: number;
      layoutId: string;
      tableTypeId: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/tables",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name,
            capacity,
            x: 10,
            y: 10,
            layout_id: layoutId,
            table_type_id: tableTypeId,
          }),
        },
        m.admin_error_add_table(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const changeTableTypeMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; tableTypeId: string },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, tableTypeId }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ table_type_id: tableTypeId }),
        },
        m.admin_error_change_table_type_status({ status: 500 }),
      ),
    onMutate: ({ tableId, tableTypeId }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, tableTypeId } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables)
        queryClient.setQueryData(tablesQueryKey, context.previousTables);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const updateTableNameMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; name: string },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, name }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ name }) },
        m.admin_error_update_table_name_status({ status: 500 }),
      ),
    onMutate: ({ tableId, name }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, name } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables)
        queryClient.setQueryData(tablesQueryKey, context.previousTables);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const moveTableMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; x: number; y: number },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ x, y }) },
        "Failed to persist table position.",
      ),
    onMutate: ({ tableId, x, y }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, x, y } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables)
        queryClient.setQueryData(tablesQueryKey, context.previousTables);
      console.error("Failed to persist table position");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const rotateTableMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; rotation: number },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, rotation }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ rotation }) },
        "Failed to persist table rotation.",
      ),
    onMutate: ({ tableId, rotation }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, rotation } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables)
        queryClient.setQueryData(tablesQueryKey, context.previousTables);
      console.error("Failed to persist table rotation");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const deleteTableMutation = useMutation({
    mutationFn: (tableId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/tables/${tableId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_table(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const createVenueMutation = useMutation({
    mutationFn: ({
      name,
      address,
      city,
      postalCode,
      country,
    }: {
      name: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/venues",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name, address, city, postal_code: postalCode, country }),
        },
        m.admin_error_add_venue(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: venuesQueryKey });
    },
    retry: false,
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ venueId, active }: { venueId: string; active: boolean }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/venues/${venueId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }) },
        active ? m.admin_error_restore_venue() : m.admin_error_archive_venue(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: venuesQueryKey });
    },
    retry: false,
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/venues/${venueId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_venue(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: venuesQueryKey }),
        queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
        queryClient.invalidateQueries({ queryKey: layoutsQueryKey }),
        queryClient.invalidateQueries({ queryKey: tablesQueryKey }),
        queryClient.invalidateQueries({ queryKey: areasQueryKey }),
      ]);
    },
    retry: false,
  });

  const createRoomMutation = useMutation({
    mutationFn: ({
      venueId,
      name,
      widthM,
      lengthM,
      color,
    }: {
      venueId: string;
      name: string;
      widthM: number;
      lengthM: number;
      color: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/rooms",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            venue_id: venueId,
            name,
            width_m: widthM,
            length_m: lengthM,
            color,
          }),
        },
        m.admin_error_add_room(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roomsQueryKey });
    },
    retry: false,
  });

  const updateRoomMutation = useMutation({
    mutationFn: ({
      roomId,
      active,
      fallbackMessage,
    }: {
      roomId: string;
      active: boolean;
      fallbackMessage: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/rooms/${roomId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }) },
        fallbackMessage,
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roomsQueryKey });
    },
    retry: false,
  });

  const createLayoutMutation = useMutation({
    mutationFn: ({ roomId, date, label }: { roomId: string; date: string; label?: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/layouts",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            edition_id: activeEdition.id,
            room_id: roomId,
            date,
            ...(label?.trim() ? { label: label.trim() } : {}),
          }),
        },
        m.admin_error_add_layout(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: layoutsQueryKey });
    },
    retry: false,
  });

  const deleteLayoutMutation = useMutation({
    mutationFn: (layoutId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/layouts/${layoutId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_layout(),
      ),
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: layoutsQueryKey }),
        queryClient.invalidateQueries({ queryKey: tablesQueryKey }),
        queryClient.invalidateQueries({ queryKey: areasQueryKey }),
      ]);
    },
    retry: false,
  });

  const createAreaMutation = useMutation({
    mutationFn: ({
      label,
      icon,
      layoutId,
      widthM,
      lengthM,
      exhibitorId,
    }: {
      label: string;
      icon: string;
      layoutId: string;
      widthM: number;
      lengthM: number;
      exhibitorId?: number;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/areas",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            label,
            icon,
            layout_id: layoutId,
            width_m: widthM,
            length_m: lengthM,
            x: 10,
            y: 10,
            exhibitor_id: exhibitorId ?? null,
          }),
        },
        m.admin_error_add_area(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const updateAreaLabelMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; label: string },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, label }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ label }) },
        "Failed to persist area label.",
      ),
    onMutate: ({ areaId, label }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, label } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      console.error("Failed to persist area label");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const resizeAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; widthM: number; lengthM: number; x: number; y: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, widthM, lengthM, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ width_m: widthM, length_m: lengthM, x, y }),
        },
        m.admin_error_resize_area_status({ status: 500 }),
      ),
    onMutate: ({ areaId, widthM, lengthM, x, y }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, widthM, lengthM, x, y } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      console.error("Failed to persist area resize");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const assignAreaMutation = useMutation({
    mutationFn: ({ areaId, body }: { areaId: string; body: Record<string, unknown> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) },
        "Failed to assign area.",
      ),
    onSuccess: (
      d: Record<string, unknown>,
      { areaId }: { areaId: string; body: Record<string, unknown> },
    ) => {
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.map((a) => (a.id === areaId ? apiAreaToArea(d) : a)) : prev,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const moveAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; x: number; y: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ x, y }) },
        "Failed to persist area position.",
      ),
    onMutate: ({ areaId, x, y }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, x, y } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      console.error("Failed to persist area position");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const rotateAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; rotation: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, rotation }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ rotation }) },
        "Failed to persist area rotation.",
      ),
    onMutate: ({ areaId, rotation }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, rotation } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      console.error("Failed to persist area rotation");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const deleteAreaMutation = useMutation({
    mutationFn: (areaId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/areas/${areaId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_area(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const createTableTypeMutation = useMutation({
    mutationFn: (data: Omit<TableType, "id">) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/table-types",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            shape: data.shape,
            width_m: data.widthM,
            length_m: data.lengthM,
            height_type: data.heightType,
            max_capacity: data.maxCapacity,
          }),
        },
        m.admin_error_add_table_type(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tableTypesQueryKey });
    },
    retry: false,
  });

  const updateTableTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<TableType, "id">> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/table-types/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...(data.name !== undefined && { name: data.name }),
            ...(data.shape !== undefined && { shape: data.shape }),
            ...(data.widthM !== undefined && { width_m: data.widthM }),
            ...(data.lengthM !== undefined && { length_m: data.lengthM }),
            ...(data.heightType !== undefined && { height_type: data.heightType }),
            ...(data.maxCapacity !== undefined && { max_capacity: data.maxCapacity }),
            ...(data.active !== undefined && { active: data.active }),
          }),
        },
        m.admin_error_update_table_type(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tableTypesQueryKey });
    },
    retry: false,
  });

  const validateToken = useCallback(
    async (tokenToValidate: string): Promise<"valid" | "invalid" | "transientError"> => {
      try {
        const status = await fetchStatus("/api/registrations", {
          headers: { Authorization: `Bearer ${tokenToValidate}` },
        });

        if (status >= 200 && status < 300) {
          return "valid";
        }

        // Auth failures: 401 Unauthorized, 403 Forbidden
        if (status === 401 || status === 403) {
          return "invalid";
        }

        // Server errors (5xx) are transient
        if (status >= 500) {
          return "transientError";
        }

        // Other client errors (4xx) treat as invalid
        return "invalid";
      } catch (err) {
        // Network errors or fetch failures are transient
        console.error("Token validation network error:", err);
        return "transientError";
      }
    },
    [],
  );

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!token.trim()) return;
      setIsLoggingIn(true);
      setLoginError("");

      try {
        const result = await validateToken(token);
        if (result === "valid") {
          sessionStorage.setItem("adminToken", token);
          storedTokenRef.current = token;
          // loadData() will be triggered by the useEffect watching isAuthenticated
          setIsAuthenticated(true);
        } else if (result === "invalid") {
          setLoginError(m.admin_login_error());
        } else {
          // transientError
          setLoginError(m.admin_error_server_transient());
        }
      } catch (err) {
        console.error("Login request failed", err);
        setLoginError(m.admin_login_error());
      } finally {
        setIsLoggingIn(false);
      }
    },
    [token, validateToken],
  );

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("adminToken");
    storedTokenRef.current = "";
    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return key === "admin";
      },
    });
    setIsAuthenticated(false);
    setToken("");
    setDetailRegistration(null);
  }, [queryClient]);

  const handleMergePeople = useCallback(
    async (canonicalId: string, duplicateId: string) => {
      const updated = await mergePeopleMutation.mutateAsync({ canonicalId, duplicateId });
      const canonicalPerson = apiToPerson(updated as Record<string, unknown>);
      const duplicate = people.find((p) => p.id === duplicateId);
      const existingCanonical = people.find((p) => p.id === canonicalId);
      const shouldPreserveVolunteerData =
        canonicalPerson.roles.includes("volunteer") ||
        existingCanonical?.roles.includes("volunteer") ||
        duplicate?.roles.includes("volunteer");
      const mergedCanonical = shouldPreserveVolunteerData
        ? mergeVolunteerPerson(existingCanonical, {
            ...canonicalPerson,
            helpPeriods: existingCanonical?.helpPeriods ?? duplicate?.helpPeriods ?? [],
          })
        : canonicalPerson;
      // Replace both the canonical and duplicate in the canonical people list.
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev
          ? prev
              .filter((p) => p.id !== duplicateId)
              .map((p) => (p.id === canonicalId ? mergedCanonical : p))
          : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev
          ? syncMembersWithPerson(
              prev.filter((member) => member.id !== duplicateId),
              mergedCanonical,
            )
          : prev,
      );
      // Re-point any registrations in state that were on the duplicate;
      // also refresh person data on any already-canonical registrations (merged fields may have changed).
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((r) =>
              r.personId === duplicateId
                ? { ...r, personId: canonicalId, person: canonicalPerson }
                : r.personId === canonicalId
                  ? { ...r, person: canonicalPerson }
                  : r,
            )
          : prev,
      );
      // Re-point any exhibitors in state that were linked to the duplicate contact person
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) =>
        prev
          ? prev.map((ex) =>
              ex.contactPersonId === duplicateId ? { ...ex, contactPersonId: canonicalId } : ex,
            )
          : prev,
      );
    },
    [
      exhibitorsQueryKey,
      membersQueryKey,
      mergePeopleMutation,
      people,
      peopleQueryKey,
      queryClient,
      registrationsQueryKey,
    ],
  );

  const handleCreateMember = useCallback(
    async (data: MemberFormData) => {
      const d = await createMemberMutation.mutateAsync(data);
      const createdMember = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? [createdMember, ...prev] : [createdMember],
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [createdMember, ...prev] : [createdMember],
      );
    },
    [createMemberMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleUpdateMember = useCallback(
    async (id: string, data: MemberFormData) => {
      const d = await updateMemberMutation.mutateAsync({ id, data });
      const updatedMember = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.map((member) => (member.id === id ? updatedMember : member)) : prev,
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replacePersonById(prev, updatedMember) : prev,
      );
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((r) =>
              r.personId === id
                ? {
                    ...r,
                    person: {
                      id: updatedMember.id,
                      name: updatedMember.name,
                      email: updatedMember.email,
                      phone: updatedMember.phone,
                    },
                  }
                : r,
            )
          : prev,
      );
      setDetailRegistration((prev) =>
        prev?.person.id === id
          ? {
              ...prev,
              person: {
                id: updatedMember.id,
                name: updatedMember.name,
                email: updatedMember.email,
                phone: updatedMember.phone,
              },
            }
          : prev,
      );
    },
    [membersQueryKey, peopleQueryKey, queryClient, registrationsQueryKey, updateMemberMutation],
  );

  const handleDeleteMember = useCallback(
    async (id: string) => {
      await deleteMemberMutation.mutateAsync(id);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.filter((member) => member.id !== id) : prev,
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? prev.filter((person) => person.id !== id) : prev,
      );
    },
    [deleteMemberMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleCreatePerson = useCallback(
    async (data: PersonFormData) => {
      const d = await createPersonMutation.mutateAsync(data);
      const createdPerson = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [createdPerson, ...prev] : [createdPerson],
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? syncMembersWithPerson(prev, createdPerson) : prev,
      );
    },
    [createPersonMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleUpdatePerson = useCallback(
    async (id: string, data: PersonFormData) => {
      const d = await updatePersonMutation.mutateAsync({ id, data });
      const updated = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replacePersonById(prev, updated) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? syncMembersWithPerson(prev, updated) : prev,
      );
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((r) =>
              r.personId === id
                ? {
                    ...r,
                    person: {
                      id: updated.id,
                      name: updated.name,
                      email: updated.email,
                      phone: updated.phone,
                    },
                  }
                : r,
            )
          : prev,
      );
      setDetailRegistration((prev) =>
        prev?.person.id === id
          ? {
              ...prev,
              person: {
                id: updated.id,
                name: updated.name,
                email: updated.email,
                phone: updated.phone,
              },
            }
          : prev,
      );
    },
    [membersQueryKey, peopleQueryKey, queryClient, registrationsQueryKey, updatePersonMutation],
  );

  const handleDeletePerson = useCallback(
    async (id: string) => {
      await deletePersonMutation.mutateAsync(id);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? prev.filter((p) => p.id !== id) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.filter((member) => member.id !== id) : prev,
      );
    },
    [deletePersonMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleCreateVolunteer = useCallback(
    async (data: VolunteerFormData) => {
      const d = await createVolunteerMutation.mutateAsync(data);
      const createdVolunteer = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [mergeVolunteerPerson(undefined, createdVolunteer), ...prev] : prev,
      );
    },
    [createVolunteerMutation, peopleQueryKey, queryClient],
  );

  const handleUpdateVolunteer = useCallback(
    async (id: string, data: VolunteerFormData) => {
      const d = await updateVolunteerMutation.mutateAsync({ id, data });
      const updatedVolunteer = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replaceVolunteerById(prev, updatedVolunteer) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev
          ? prev.map((member) =>
              member.id === id
                ? {
                    ...member,
                    name: updatedVolunteer.name,
                    address: updatedVolunteer.address,
                    active: updatedVolunteer.active,
                    updatedAt: updatedVolunteer.updatedAt,
                  }
                : member,
            )
          : prev,
      );
    },
    [membersQueryKey, peopleQueryKey, queryClient, updateVolunteerMutation],
  );

  const handleDeleteVolunteer = useCallback(
    async (id: string) => {
      await deleteVolunteerMutation.mutateAsync(id);
      // The person record is preserved (soft archive); only the volunteer role
      // and help periods are removed.  Update local state accordingly so that
      // the person remains visible in People/Members tabs if applicable.
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev
          ? prev.map((person) =>
              person.id !== id
                ? person
                : {
                    ...person,
                    roles: person.roles.filter((r) => r !== "volunteer"),
                    helpPeriods: [],
                  },
            )
          : prev,
      );
    },
    [deleteVolunteerMutation, peopleQueryKey, queryClient],
  );

  const handleExhibitorSaved = useCallback(
    (item: ItemDraft) => {
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) => {
        const entry = {
          id: item.id,
          name: item.name,
          active: item.active ?? true,
          contactPersonId: item.contactPersonId ?? null,
        };
        if (!prev) return prev;
        const idx = prev.findIndex((e) => e.id === item.id);
        if (idx >= 0) {
          return prev.map((e) => (e.id === item.id ? entry : e));
        }
        return [...prev, entry];
      });
    },
    [exhibitorsQueryKey, queryClient],
  );

  const handleExhibitorDeleted = useCallback(
    (id: number) => {
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    },
    [exhibitorsQueryKey, queryClient],
  );

  const volunteers = useMemo(
    () => people.filter((person) => person.roles.includes("volunteer")),
    [people],
  );

  useEffect(() => {
    const errors = [
      registrationsQuery.error,
      tablesQuery.error,
      venuesQuery.error,
      eventsQuery.error,
      roomsQuery.error,
      tableTypesQuery.error,
      layoutsQuery.error,
      exhibitorsQuery.error,
      areasQuery.error,
      peopleQuery.error,
      membersQuery.error,
    ];

    const unauthorizedError = errors.find(
      (e) => e instanceof Error && e.message === "unauthorized",
    );
    if (unauthorizedError) {
      sessionStorage.removeItem("adminToken");
      storedTokenRef.current = "";
      setIsAuthenticated(false);
      setLoginError(m.admin_login_error());
      return;
    }

    const firstError = errors.find((e) => e !== null);
    if (firstError) {
      console.error("Failed to load dashboard data", firstError);
      setError(m.admin_error_load_data());
    } else {
      // All queries succeeded or are still loading — clear any previous error.
      setError("");
    }
  }, [
    registrationsQuery.error,
    tablesQuery.error,
    venuesQuery.error,
    eventsQuery.error,
    roomsQuery.error,
    tableTypesQuery.error,
    layoutsQuery.error,
    exhibitorsQuery.error,
    areasQuery.error,
    peopleQuery.error,
    membersQuery.error,
  ]);

  // Auto-authenticate on mount if a token was previously stored in sessionStorage
  useEffect(() => {
    if (autoAuthRan.current || !storedTokenRef.current || isAuthenticated) return;
    autoAuthRan.current = true;
    validateToken(storedTokenRef.current)
      .then((result) => {
        if (result === "valid") {
          setIsAuthenticated(true);
        } else if (result === "invalid") {
          // Only clear stored token on auth failures
          sessionStorage.removeItem("adminToken");
          storedTokenRef.current = "";
          setLoginError(m.admin_login_error());
        } else {
          // transientError: keep the token, log the error
          console.error("Auto-authentication failed due to transient error");
          setLoginError(m.admin_error_server_transient_refresh());
        }
      })
      .catch((err) => {
        // Unexpected error in the effect itself
        console.error("Auto-authentication exception:", err);
        setLoginError(m.admin_error_auto_auth_failed());
      });
  }, [isAuthenticated, validateToken]);

  const handleUpdateStatus = useCallback(
    async (id: string, status: RegistrationStatus) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id,
            payload: { status },
            fallbackMessage: m.admin_error_update_registration(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((r) =>
                r.id === id ? { ...r, status: updated.status, updatedAt: updated.updatedAt } : r,
              )
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === id
            ? { ...prev, status: updated.status, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        console.error("Failed to update registration status", err);
        setError(err instanceof Error ? err.message : m.admin_error_update_registration());
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  const handleUpdatePayment = useCallback(
    async (id: string, paymentStatus: PaymentStatus) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id,
            payload: { payment_status: paymentStatus },
            fallbackMessage: m.admin_error_update_payment(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((r) =>
                r.id === id
                  ? { ...r, paymentStatus: updated.paymentStatus, updatedAt: updated.updatedAt }
                  : r,
              )
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === id
            ? { ...prev, paymentStatus: updated.paymentStatus, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        console.error("Failed to update payment status", err);
        setError(err instanceof Error ? err.message : m.admin_error_update_payment());
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  const handleAssignTable = useCallback(
    async (registrationId: string, tableId: string | undefined) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { table_id: tableId ?? null },
            fallbackMessage: m.admin_error_assign_table(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((r) =>
                r.id === registrationId
                  ? { ...r, tableId: updated.tableId, updatedAt: updated.updatedAt }
                  : r,
              )
            : prev,
        );
        queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
          prev
            ? prev.map((t) => {
                const wasAssigned = t.registrationIds.includes(registrationId);
                const shouldBeAssigned = t.id === updated.tableId;
                if (wasAssigned && !shouldBeAssigned) {
                  return {
                    ...t,
                    registrationIds: t.registrationIds.filter((id) => id !== registrationId),
                  };
                }
                if (!wasAssigned && shouldBeAssigned) {
                  return { ...t, registrationIds: [...t.registrationIds, registrationId] };
                }
                return t;
              })
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === registrationId
            ? { ...prev, tableId: updated.tableId, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        console.error("Failed to assign table", err);
        setError(err instanceof Error ? err.message : m.admin_error_assign_table());
      }
    },
    [queryClient, registrationsQueryKey, tablesQueryKey, updateRegistrationMutation],
  );

  const handleAddTable = useCallback(
    async (name: string, capacity: number, layoutId: string, tableTypeId: string) => {
      const data = await createTableMutation.mutateAsync({ name, capacity, layoutId, tableTypeId });
      const table = (data.table ?? data) as Record<string, unknown>;
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? [...prev, apiTableToTable(table)] : [apiTableToTable(table)],
      );
    },
    [createTableMutation, queryClient, tablesQueryKey],
  );

  const handleMoveTable = useCallback(
    (tableId: string, x: number, y: number) => {
      moveTableMutation.mutate({ tableId, x, y });
    },
    [moveTableMutation],
  );

  const handleRotateTable = useCallback(
    (tableId: string, rotation: number) => {
      rotateTableMutation.mutate({ tableId, rotation: ((rotation % 360) + 360) % 360 });
    },
    [rotateTableMutation],
  );

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      await deleteTableMutation.mutateAsync(tableId);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => t.id !== tableId) : prev,
      );
    },
    [deleteTableMutation, queryClient, tablesQueryKey],
  );

  const handleAddVenue = useCallback(
    async (name: string, address: string, city: string, postalCode: string, country: string) => {
      const d = await createVenueMutation.mutateAsync({ name, address, city, postalCode, country });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? [...prev, apiVenueToVenue(d)] : [apiVenueToVenue(d)],
      );
    },
    [createVenueMutation, queryClient, venuesQueryKey],
  );

  const handleArchiveVenue = useCallback(
    async (venueId: string) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, active: false });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)) : prev,
      );
    },
    [queryClient, updateVenueMutation, venuesQueryKey],
  );

  const handleRestoreVenue = useCallback(
    async (venueId: string) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, active: true });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)) : prev,
      );
    },
    [queryClient, updateVenueMutation, venuesQueryKey],
  );

  const handleDeleteVenue = useCallback(
    async (venueId: string) => {
      await deleteVenueMutation.mutateAsync(venueId);
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.filter((v) => v.id !== venueId) : prev,
      );
      // Cascade: remove rooms and their layouts/tables from local state
      const venueRoomIds = rooms.filter((r) => r.venueId === venueId).map((r) => r.id);
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.filter((r) => r.venueId !== venueId) : prev,
      );
      const venueLayoutIds = layouts
        .filter((l) => venueRoomIds.includes(l.roomId ?? ""))
        .map((l) => l.id);
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? prev.filter((l) => !venueRoomIds.includes(l.roomId ?? "")) : prev,
      );
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => !venueLayoutIds.includes(t.layoutId)) : prev,
      );
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => !venueLayoutIds.includes(a.layoutId)) : prev,
      );
    },
    [
      areasQueryKey,
      deleteVenueMutation,
      layouts,
      layoutsQueryKey,
      queryClient,
      rooms,
      roomsQueryKey,
      tablesQueryKey,
      venuesQueryKey,
    ],
  );

  const handleAddRoom = useCallback(
    async (venueId: string, name: string, widthM: number, lengthM: number, color: string) => {
      const data = await createRoomMutation.mutateAsync({ venueId, name, widthM, lengthM, color });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? [...prev, apiRoomToRoom(data)] : [apiRoomToRoom(data)],
      );
    },
    [createRoomMutation, queryClient, roomsQueryKey],
  );

  const handleArchiveRoom = useCallback(
    async (roomId: string) => {
      const data = await updateRoomMutation.mutateAsync({
        roomId,
        active: false,
        fallbackMessage: m.admin_error_delete_room(),
      });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)) : prev,
      );
    },
    [queryClient, roomsQueryKey, updateRoomMutation],
  );

  const handleRestoreRoom = useCallback(
    async (roomId: string) => {
      const data = await updateRoomMutation.mutateAsync({
        roomId,
        active: true,
        fallbackMessage: m.admin_content_error_save(),
      });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)) : prev,
      );
    },
    [queryClient, roomsQueryKey, updateRoomMutation],
  );

  const handleAddLayout = useCallback(
    async (roomId: string, date: string, label?: string) => {
      const d = await createLayoutMutation.mutateAsync({ roomId, date, label });
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? [...prev, apiLayoutToLayout(d)] : [apiLayoutToLayout(d)],
      );
    },
    [createLayoutMutation, layoutsQueryKey, queryClient],
  );

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      await deleteLayoutMutation.mutateAsync(layoutId);
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? prev.filter((l) => l.id !== layoutId) : prev,
      );
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => t.layoutId !== layoutId) : prev,
      );
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => a.layoutId !== layoutId) : prev,
      );
    },
    [areasQueryKey, deleteLayoutMutation, layoutsQueryKey, queryClient, tablesQueryKey],
  );

  const handleAddArea = useCallback(
    async (
      label: string,
      icon: string,
      layoutId: string,
      widthM: number,
      lengthM: number,
      exhibitorId?: number,
    ) => {
      const data = await createAreaMutation.mutateAsync({
        label,
        icon,
        layoutId,
        widthM,
        lengthM,
        exhibitorId,
      });
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? [...prev, apiAreaToArea(data)] : [apiAreaToArea(data)],
      );
    },
    [areasQueryKey, createAreaMutation, queryClient],
  );

  const handleMoveArea = useCallback(
    (areaId: string, x: number, y: number) => {
      moveAreaMutation.mutate({ areaId, x, y });
    },
    [moveAreaMutation],
  );

  const handleRotateArea = useCallback(
    (areaId: string, rotation: number) => {
      rotateAreaMutation.mutate({ areaId, rotation: ((rotation % 360) + 360) % 360 });
    },
    [rotateAreaMutation],
  );

  const handleDeleteArea = useCallback(
    async (areaId: string) => {
      await deleteAreaMutation.mutateAsync(areaId);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => a.id !== areaId) : prev,
      );
    },
    [areasQueryKey, deleteAreaMutation, queryClient],
  );

  const handleAssignAreaToItem = useCallback(
    async (areaId: string, exhibitorId: number | null, label?: string, icon?: string) => {
      const body: Record<string, unknown> = { exhibitor_id: exhibitorId };
      if (label !== undefined) body.label = label;
      if (icon !== undefined) body.icon = icon;
      await assignAreaMutation.mutateAsync({ areaId, body });
    },
    [assignAreaMutation],
  );

  const handleUpdateAreaLabel = useCallback(
    (areaId: string, label: string) => {
      updateAreaLabelMutation.mutate({ areaId, label });
    },
    [updateAreaLabelMutation],
  );

  const handleChangeTableType = useCallback(
    async (tableId: string, tableTypeId: string) => {
      await changeTableTypeMutation.mutateAsync({ tableId, tableTypeId });
    },
    [changeTableTypeMutation],
  );

  const handleUpdateTable = useCallback(
    async (tableId: string, name: string) => {
      await updateTableNameMutation.mutateAsync({ tableId, name });
    },
    [updateTableNameMutation],
  );

  const handleResizeArea = useCallback(
    async (areaId: string, widthM: number, lengthM: number) => {
      // Must match LayoutEditor/RoomCanvas constants
      const PX_PER_M = 28;
      const area = areas.find((a) => a.id === areaId);
      const layout = layouts.find((l) => l.id === area?.layoutId);
      const room = rooms.find((r) => r.id === layout?.roomId);

      // Clamp the area's position so it stays within the canvas after resize.
      let x = area?.x ?? 0;
      let y = area?.y ?? 0;
      if (area && room) {
        const canvasW = Math.max(280, room.widthM * PX_PER_M);
        const canvasH = Math.max(180, room.lengthM * PX_PER_M);
        const areaW = Math.max(40, Math.round(widthM * PX_PER_M));
        const areaH = Math.max(24, Math.round(lengthM * PX_PER_M));
        x = (Math.max(0, Math.min((area.x / 100) * canvasW, canvasW - areaW)) / canvasW) * 100;
        y = (Math.max(0, Math.min((area.y / 100) * canvasH, canvasH - areaH)) / canvasH) * 100;
      }

      await resizeAreaMutation.mutateAsync({ areaId, widthM, lengthM, x, y });
    },
    [areas, layouts, rooms, resizeAreaMutation],
  );

  const handleAddRegistration = useCallback(
    (registration: Registration) => {
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev ? [registration, ...prev] : [registration],
      );
    },
    [queryClient, registrationsQueryKey],
  );

  const handleAddTableType = useCallback(
    async (data: Omit<TableType, "id">) => {
      const d = await createTableTypeMutation.mutateAsync(data);
      queryClient.setQueryData<TableType[]>(tableTypesQueryKey, (prev) =>
        prev ? [...prev, apiTableTypeToTableType(d)] : [apiTableTypeToTableType(d)],
      );
    },
    [createTableTypeMutation, queryClient, tableTypesQueryKey],
  );

  const handleUpdateTableType = useCallback(
    async (id: string, data: Partial<Omit<TableType, "id">>) => {
      const d = await updateTableTypeMutation.mutateAsync({ id, data });
      queryClient.setQueryData<TableType[]>(tableTypesQueryKey, (prev) =>
        prev ? prev.map((tt) => (tt.id === id ? apiTableTypeToTableType(d) : tt)) : prev,
      );
    },
    [queryClient, tableTypesQueryKey, updateTableTypeMutation],
  );

  const handleArchiveTableType = useCallback(
    (id: string) => handleUpdateTableType(id, { active: false }),
    [handleUpdateTableType],
  );

  const handleRestoreTableType = useCallback(
    (id: string) => handleUpdateTableType(id, { active: true }),
    [handleUpdateTableType],
  );

  /** Fetch the full registration (including checkInToken) and open detail modal */
  const handleViewDetail = useCallback(
    async (res: Registration) => {
      try {
        const data = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
          `/api/registrations/${res.id}`,
          { headers: authHeaders() },
          m.admin_error_load_data(),
        );
        setDetailRegistration(apiToRegistration(data));
      } catch (err) {
        console.error("Failed to fetch registration detail, falling back to list data", err);
        setDetailRegistration(res);
      }
    },
    [authHeaders],
  );

  const handleToggleDelivered = useCallback(
    async (registrationId: string, updatedOrders: OrderItem[]) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: {
              pre_orders: updatedOrders.map((o) => ({
                product_id: o.productId,
                name: o.name,
                quantity: o.quantity,
                price: o.price,
                category: o.category,
                delivered: o.delivered,
              })),
            },
            fallbackMessage: m.admin_error_bottle_delivery(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev ? prev.map((r) => (r.id === registrationId ? updated : r)) : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        console.error("Failed to update bottle delivery status", err);
        setError(err instanceof Error ? err.message : m.admin_error_bottle_delivery());
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  const handleCheckIn = useCallback(
    async (registrationId: string) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { checked_in: true },
            fallbackMessage: m.admin_error_check_in(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev ? prev.map((r) => (r.id === registrationId ? updated : r)) : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        console.error("Failed to check in guest", err);
        setError(err instanceof Error ? err.message : m.admin_error_check_in());
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  const handleIssueStrap = useCallback(
    async (registrationId: string) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { strap_issued: true },
            fallbackMessage: m.admin_error_issue_strap(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev ? prev.map((r) => (r.id === registrationId ? updated : r)) : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        console.error("Failed to issue strap", err);
        setError(err instanceof Error ? err.message : m.admin_error_issue_strap());
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  // Computed maps derived from people/registrations state — must stay above any early return
  // to satisfy the Rules of Hooks (hooks must be called unconditionally).
  const registrationCountByPersonId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of registrations) {
      if (r.personId == null) continue;
      counts[r.personId] = (counts[r.personId] ?? 0) + 1;
    }
    return Object.fromEntries(people.map((p) => [p.id, counts[p.id] ?? 0]));
  }, [people, registrations]);

  if (!visible) return null;

  return (
    <section id="admin" aria-labelledby="admin-title" className="py-5">
      <Container>
        <h2 id="admin-title" className="text-center mb-4 text-warning">
          <i className="bi bi-shield-lock me-2" aria-hidden="true" />
          {m.admin_title()}
        </h2>

        {!isAuthenticated ? (
          <div className="row justify-content-center">
            <div className="col-12 col-sm-8 col-md-6 col-lg-4">
              <Card bg="dark" text="white" border="warning">
                <Card.Header className="border-warning">
                  <Card.Title className="mb-0">{m.admin_login_title()}</Card.Title>
                </Card.Header>
                <Card.Body>
                  <Form onSubmit={handleLogin}>
                    <Form.Group className="mb-3" controlId="admin-token">
                      <Form.Label>{m.admin_token_label()}</Form.Label>
                      <Form.Control
                        type="password"
                        value={token}
                        onChange={(e) => {
                          setToken(e.target.value);
                          setLoginError("");
                        }}
                        placeholder={m.admin_token_placeholder()}
                        className="bg-dark text-light border-secondary"
                        autoComplete="current-password"
                        required
                      />
                    </Form.Group>
                    {loginError && (
                      <Alert variant="danger" className="py-2">
                        {loginError}
                      </Alert>
                    )}
                    <Button
                      type="submit"
                      variant="warning"
                      className="w-100"
                      disabled={isLoggingIn || !token.trim()}
                    >
                      {isLoggingIn ? (
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                        />
                      ) : (
                        m.admin_login_button()
                      )}
                    </Button>
                  </Form>
                </Card.Body>
              </Card>
            </div>
          </div>
        ) : (
          <>
            <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
              <span className="text-secondary">
                <i className="bi bi-check-circle-fill text-success me-2" aria-hidden="true" />
                {m.admin_authenticated()}
              </span>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={loadData}
                  disabled={isAnyFetching}
                >
                  <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
                  {m.admin_refresh()}
                </Button>
                <Button variant="outline-danger" size="sm" onClick={handleLogout}>
                  <i className="bi bi-box-arrow-right me-1" aria-hidden="true" />
                  {m.admin_logout()}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="danger" className="mb-3" dismissible onClose={() => setError("")}>
                {error}
              </Alert>
            )}

            {isAnyPending ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="warning" role="status">
                  <span className="visually-hidden">{m.admin_loading()}</span>
                </Spinner>
              </div>
            ) : (
              <Tab.Container defaultActiveKey="registrations">
                <Nav variant="tabs" className="mb-3">
                  <Nav.Item>
                    <Nav.Link eventKey="registrations" className="text-light">
                      <i className="bi bi-calendar-check me-2" aria-hidden="true" />
                      {m.admin_registrations_tab()}
                      <span className="badge bg-warning text-dark ms-2">
                        {registrations.length}
                      </span>
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="tables" className="text-light">
                      <i className="bi bi-grid-3x3-gap me-2" aria-hidden="true" />
                      {m.admin_tables_tab()}
                      <span className="badge bg-secondary ms-2">{tables.length}</span>
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="venues" className="text-light">
                      <i className="bi bi-geo-alt me-2" aria-hidden="true" />
                      {m.admin_venues_tab()}
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="table-types" className="text-light">
                      <i className="bi bi-grid me-2" aria-hidden="true" />
                      {m.admin_table_types_tab()}
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="content" className="text-light">
                      <i className="bi bi-images me-2" aria-hidden="true" />
                      {m.admin_content_tab()}
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="people" className="text-light">
                      <i className="bi bi-people me-2" aria-hidden="true" />
                      {m.admin_people_tab()}
                      <span className="badge bg-secondary ms-2">{people.length}</span>
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="members" className="text-light">
                      <i className="bi bi-person-badge me-2" aria-hidden="true" />
                      {m.admin_members_tab()}
                      <span className="badge bg-secondary ms-2">{members.length}</span>
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="volunteers" className="text-light">
                      <i className="bi bi-hand-thumbs-up me-2" aria-hidden="true" />
                      {m.admin_volunteers_tab()}
                      <span className="badge bg-secondary ms-2">{volunteers.length}</span>
                    </Nav.Link>
                  </Nav.Item>
                </Nav>
                <Tab.Content>
                  <Tab.Pane eventKey="registrations">
                    <RegistrationList
                      registrations={registrations}
                      tables={tables}
                      exhibitors={exhibitors}
                      filter={filter}
                      onFilterChange={setFilter}
                      onUpdateStatus={handleUpdateStatus}
                      onUpdatePayment={handleUpdatePayment}
                      onAssignTable={handleAssignTable}
                      onViewDetail={handleViewDetail}
                      onAddRegistration={handleAddRegistration}
                      authHeaders={authHeaders}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="tables">
                    <LayoutEditor
                      dayOptions={layoutDayOptions}
                      tables={tables}
                      tableTypes={tableTypes}
                      layouts={layouts}
                      registrations={registrations}
                      rooms={rooms}
                      exhibitors={exhibitors}
                      areas={areas}
                      onAddTable={handleAddTable}
                      onMoveTable={handleMoveTable}
                      onDeleteTable={handleDeleteTable}
                      onRotateTable={handleRotateTable}
                      onAddLayout={handleAddLayout}
                      onDeleteLayout={handleDeleteLayout}
                      onAddArea={handleAddArea}
                      onMoveArea={handleMoveArea}
                      onDeleteArea={handleDeleteArea}
                      onRotateArea={handleRotateArea}
                      onAssignAreaToItem={handleAssignAreaToItem}
                      onUpdateAreaLabel={handleUpdateAreaLabel}
                      onChangeTableType={handleChangeTableType}
                      onUpdateTable={handleUpdateTable}
                      onResizeArea={handleResizeArea}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="venues">
                    <VenueManagement
                      venues={venues}
                      rooms={rooms}
                      onAdd={handleAddVenue}
                      onArchive={handleArchiveVenue}
                      onRestore={handleRestoreVenue}
                      onDelete={handleDeleteVenue}
                      onAddRoom={handleAddRoom}
                      onArchiveRoom={handleArchiveRoom}
                      onRestoreRoom={handleRestoreRoom}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="table-types">
                    <TableTypeManagement
                      tableTypes={tableTypes}
                      onAdd={handleAddTableType}
                      onUpdate={handleUpdateTableType}
                      onArchive={handleArchiveTableType}
                      onRestore={handleRestoreTableType}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="content">
                    <ContentManagement
                      authHeaders={authHeaders}
                      venues={venues}
                      onExhibitorSaved={handleExhibitorSaved}
                      onExhibitorDeleted={handleExhibitorDeleted}
                      onEditionMutated={() => {
                        void Promise.all([
                          loadData(),
                          queryClient.invalidateQueries({ queryKey: activeEditionQueryKey }),
                          queryClient.invalidateQueries({
                            queryKey: queryKeys.admin.activeEditionEvents,
                          }),
                        ]);
                      }}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="people">
                    <PeopleManagement
                      people={people}
                      registrationCountByPersonId={registrationCountByPersonId}
                      isLoading={isAnyFetching}
                      authHeaders={authHeaders}
                      onMerge={handleMergePeople}
                      onCreate={handleCreatePerson}
                      onUpdate={handleUpdatePerson}
                      onDelete={handleDeletePerson}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="members">
                    <MembersManagement
                      members={members}
                      registrationCountByPersonId={registrationCountByPersonId}
                      isLoading={isAnyFetching}
                      onCreate={handleCreateMember}
                      onUpdate={handleUpdateMember}
                      onDelete={handleDeleteMember}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="volunteers">
                    <VolunteersManagement
                      volunteers={volunteers}
                      isLoading={isAnyFetching}
                      onCreate={handleCreateVolunteer}
                      onUpdate={handleUpdateVolunteer}
                      onDelete={handleDeleteVolunteer}
                    />
                  </Tab.Pane>
                </Tab.Content>
              </Tab.Container>
            )}
          </>
        )}

        {/* Registration detail modal (with QR code + bottle delivery) */}
        {detailRegistration && (
          <RegistrationDetail
            registration={detailRegistration}
            baseUrl={window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "")}
            emailDuplicates={(() => {
              const personEmail = detailRegistration.person.email.toLowerCase();
              return people
                .filter(
                  (p) =>
                    p.id !== detailRegistration.personId &&
                    p.email &&
                    p.email.toLowerCase() === personEmail,
                )
                .map((p) => ({ id: p.id, name: p.name }));
            })()}
            onClose={() => setDetailRegistration(null)}
            onToggleDelivered={handleToggleDelivered}
            onCheckIn={handleCheckIn}
            onIssueStrap={handleIssueStrap}
            onMergeDuplicate={async (canonicalId, duplicateId) => {
              try {
                await handleMergePeople(canonicalId, duplicateId);
                setDetailRegistration(null);
              } catch (err) {
                console.error("Failed to merge people", err);
                setError(err instanceof Error ? err.message : m.admin_people_merge_error());
              }
            }}
          />
        )}
      </Container>
    </section>
  );
}

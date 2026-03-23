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
import type { Registration, RegistrationStatus, PaymentStatus, OrderItem } from "@/types/registration";
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

interface AdminDashboardData {
  registrations: Registration[];
  tables: FloorTable[];
  venues: Venue[];
  events: Event[];
  rooms: Room[];
  tableTypes: TableType[];
  layouts: Layout[];
  exhibitors: { id: number; name: string; active: boolean; contactPersonId: string | null }[];
  areas: FloorArea[];
  people: Person[];
  members: Person[];
}

function createEmptyDashboardData(): AdminDashboardData {
  return {
    registrations: [],
    tables: [],
    venues: [],
    events: [],
    rooms: [],
    tableTypes: [],
    layouts: [],
    exhibitors: [],
    areas: [],
    people: [],
    members: [],
  };
}

async function loadMembers(
  authHeaders: () => Record<string, string>,
): Promise<Person[]> {
  return fetchArrayOrThrow("/api/members", { headers: authHeaders() }, m.admin_error_load_data(), apiToPerson);
}

async function loadVolunteers(
  authHeaders: () => Record<string, string>,
): Promise<Person[]> {
  return fetchArrayOrThrow(
    "/api/volunteers",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiToPerson,
  );
}

async function fetchAdminDashboardData(
  authHeaders: () => Record<string, string>,
): Promise<AdminDashboardData> {
  const [
    registrationsPayload,
    tablesPayload,
    venuesPayload,
    eventsPayload,
    roomsPayload,
    tableTypesPayload,
    layoutsPayload,
    exhibitorsPayload,
    areasPayload,
    peoplePayload,
    members,
    volunteers,
  ] = await Promise.all([
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/registrations",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[] | { tables?: Record<string, unknown>[] }>(
      "/api/tables",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/venues",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/events",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/rooms",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/table-types",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/layouts",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/exhibitors",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/areas",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
      "/api/people",
      { headers: authHeaders() },
      m.admin_error_load_data(),
    ),
    loadMembers(authHeaders),
    loadVolunteers(authHeaders),
  ]);

  const rawRegistrations: Record<string, unknown>[] = Array.isArray(registrationsPayload)
    ? registrationsPayload
    : [];

  const rawTables: Record<string, unknown>[] = Array.isArray(tablesPayload)
    ? tablesPayload
    : (tablesPayload.tables ?? []);

  const nextPeople = Array.isArray(peoplePayload) ? peoplePayload.map(apiToPerson) : [];

  return {
    registrations: rawRegistrations.map(apiToRegistration),
    tables: rawTables.map(apiTableToTable),
    venues: Array.isArray(venuesPayload) ? venuesPayload.map(apiVenueToVenue) : [],
    events: Array.isArray(eventsPayload) ? eventsPayload.map(apiToEvent) : [],
    rooms: Array.isArray(roomsPayload) ? roomsPayload.map(apiRoomToRoom) : [],
    tableTypes: Array.isArray(tableTypesPayload)
      ? tableTypesPayload.map(apiTableTypeToTableType)
      : [],
    layouts: Array.isArray(layoutsPayload) ? layoutsPayload.map(apiLayoutToLayout) : [],
    exhibitors: Array.isArray(exhibitorsPayload)
      ? exhibitorsPayload.map((exhibitor: Record<string, unknown>) => ({
          id: exhibitor.id as number,
          name: exhibitor.name as string,
          active: (exhibitor.active ?? true) as boolean,
          contactPersonId: (exhibitor.contact_person_id as string | null) ?? null,
        }))
      : [],
    areas: Array.isArray(areasPayload) ? areasPayload.map(apiAreaToArea) : [],
    people: mergePeopleWithVolunteers(nextPeople, volunteers),
    members,
  };
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

  const dashboardQuery = useQuery({
    queryKey: queryKeys.adminDashboard(storedTokenRef.current),
    queryFn: () => fetchAdminDashboardData(authHeaders),
    enabled: visible && isAuthenticated,
    staleTime: 60 * 1000,
    retry: false,
  });
  const currentDashboardQueryKey = queryKeys.adminDashboard(storedTokenRef.current);
  const dashboardData = dashboardQuery.data ?? createEmptyDashboardData();
  const {
    registrations,
    tables,
    venues,
    rooms,
    tableTypes,
    layouts,
    exhibitors,
    areas,
    people,
    members,
  } = dashboardData;
  const updateDashboardData = useCallback(
    (updater: (prev: AdminDashboardData) => AdminDashboardData) => {
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (prev) =>
        updater(prev ?? createEmptyDashboardData()),
      );
    },
    [currentDashboardQueryKey, queryClient],
  );
  const updateDashboardField = useCallback(
    <K extends keyof AdminDashboardData>(
      key: K,
      updater: (value: AdminDashboardData[K]) => AdminDashboardData[K],
    ) => {
      updateDashboardData((prev) => ({
        ...prev,
        [key]: updater(prev[key]),
      }));
    },
    [updateDashboardData],
  );

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
    await dashboardQuery.refetch();
  }, [dashboardQuery]);

  const mergePeopleMutation = useMutation({
    mutationFn: ({ canonicalId, duplicateId }: { canonicalId: string; duplicateId: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/people/${canonicalId}/merge/${duplicateId}`,
        { method: "POST", headers: authHeaders() },
        m.admin_people_merge_error(),
      ),
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
    retry: false,
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(`/api/members/${id}`, { method: "DELETE", headers: authHeaders() }, m.admin_members_error_delete()),
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
    retry: false,
  });

  const deletePersonMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(`/api/people/${id}`, { method: "DELETE", headers: authHeaders() }, m.admin_error_delete_person()),
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
    retry: false,
  });

  const deleteVolunteerMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(`/api/volunteers/${id}`, { method: "DELETE", headers: authHeaders() }, m.admin_volunteers_error_delete()),
    retry: false,
  });

  const updateRegistrationMutation = useMutation({
    mutationFn: ({ id, payload, fallbackMessage }: { id: string; payload: Record<string, unknown>; fallbackMessage: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/registrations/${id}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) },
        fallbackMessage,
      ),
    retry: false,
  });

  const createTableMutation = useMutation({
    mutationFn: ({ name, capacity, layoutId, tableTypeId }: { name: string; capacity: number; layoutId: string; tableTypeId: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/tables",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name, capacity, x: 10, y: 10, layout_id: layoutId, table_type_id: tableTypeId }),
        },
        m.admin_error_add_table(),
      ),
    retry: false,
  });

  const changeTableTypeMutation = useMutation({
    mutationFn: ({ tableId, tableTypeId }: { tableId: string; tableTypeId: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ table_type_id: tableTypeId }) },
        m.admin_error_change_table_type_status({ status: 500 }),
      ),
    onMutate: ({ tableId, tableTypeId }: { tableId: string; tableTypeId: string }) => {
      const previousData = queryClient.getQueryData<AdminDashboardData>(currentDashboardQueryKey);
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (old: AdminDashboardData | undefined) =>
        old ? { ...old, tables: old.tables.map((t: FloorTable) => (t.id === tableId ? { ...t, tableTypeId } : t)) } : old,
      );
      return { previousData };
    },
    onError: (_err: unknown, _vars: unknown, context: { previousData: AdminDashboardData | undefined } | undefined) => {
      if (context?.previousData) queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      console.error("Failed to persist table type change");
    },
    retry: false,
  });

  const updateTableNameMutation = useMutation({
    mutationFn: ({ tableId, name }: { tableId: string; name: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ name }) },
        m.admin_error_update_table_name_status({ status: 500 }),
      ),
    onMutate: ({ tableId, name }: { tableId: string; name: string }) => {
      const previousData = queryClient.getQueryData<AdminDashboardData>(currentDashboardQueryKey);
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (old: AdminDashboardData | undefined) =>
        old ? { ...old, tables: old.tables.map((t: FloorTable) => (t.id === tableId ? { ...t, name } : t)) } : old,
      );
      return { previousData };
    },
    onError: (_err: unknown, _vars: unknown, context: { previousData: AdminDashboardData | undefined } | undefined) => {
      if (context?.previousData) queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      console.error("Failed to persist table name");
    },
    retry: false,
  });

  const moveTableMutation = useMutation({
    mutationFn: ({ tableId, x, y }: { tableId: string; x: number; y: number }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ x, y }) },
        "Failed to persist table position.",
      ),
    onMutate: ({ tableId, x, y }: { tableId: string; x: number; y: number }) => {
      const previousData = queryClient.getQueryData<AdminDashboardData>(currentDashboardQueryKey);
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (old: AdminDashboardData | undefined) =>
        old ? { ...old, tables: old.tables.map((t: FloorTable) => (t.id === tableId ? { ...t, x, y } : t)) } : old,
      );
      return { previousData };
    },
    onError: (_err: unknown, _vars: unknown, context: { previousData: AdminDashboardData | undefined } | undefined) => {
      if (context?.previousData) queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      console.error("Failed to persist table position");
    },
    retry: false,
  });

  const rotateTableMutation = useMutation({
    mutationFn: ({ tableId, rotation }: { tableId: string; rotation: number }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ rotation }) },
        "Failed to persist table rotation.",
      ),
    onMutate: ({ tableId, rotation }: { tableId: string; rotation: number }) => {
      const previousData = queryClient.getQueryData<AdminDashboardData>(currentDashboardQueryKey);
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (old: AdminDashboardData | undefined) =>
        old ? { ...old, tables: old.tables.map((t: FloorTable) => (t.id === tableId ? { ...t, rotation } : t)) } : old,
      );
      return { previousData };
    },
    onError: (_err: unknown, _vars: unknown, context: { previousData: AdminDashboardData | undefined } | undefined) => {
      if (context?.previousData) queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      console.error("Failed to persist table rotation");
    },
    retry: false,
  });

  const deleteTableMutation = useMutation({
    mutationFn: (tableId: string) =>
      fetchVoidOrThrowWithUnauthorized(`/api/tables/${tableId}`, { method: "DELETE", headers: authHeaders() }, m.admin_error_delete_table()),
    retry: false,
  });

  const createVenueMutation = useMutation({
    mutationFn: ({ name, address, city, postalCode, country }: { name: string; address: string; city: string; postalCode: string; country: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/venues",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name, address, city, postal_code: postalCode, country }),
        },
        m.admin_error_add_venue(),
      ),
    retry: false,
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ venueId, active }: { venueId: string; active: boolean }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/venues/${venueId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }) },
        active ? m.admin_error_restore_venue() : m.admin_error_archive_venue(),
      ),
    retry: false,
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: string) =>
      fetchVoidOrThrowWithUnauthorized(`/api/venues/${venueId}`, { method: "DELETE", headers: authHeaders() }, m.admin_error_delete_venue()),
    retry: false,
  });

  const createRoomMutation = useMutation({
    mutationFn: ({ venueId, name, widthM, lengthM, color }: { venueId: string; name: string; widthM: number; lengthM: number; color: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/rooms",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ venue_id: venueId, name, width_m: widthM, length_m: lengthM, color }),
        },
        m.admin_error_add_room(),
      ),
    retry: false,
  });

  const updateRoomMutation = useMutation({
    mutationFn: ({ roomId, active, fallbackMessage }: { roomId: string; active: boolean; fallbackMessage: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/rooms/${roomId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }) },
        fallbackMessage,
      ),
    retry: false,
  });

  const createLayoutMutation = useMutation({
    mutationFn: ({ roomId, date, label }: { roomId: string; date: string; label?: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/layouts",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ edition_id: activeEdition.id, room_id: roomId, date, ...(label?.trim() ? { label: label.trim() } : {}) }),
        },
        m.admin_error_add_layout(),
      ),
    retry: false,
  });

  const deleteLayoutMutation = useMutation({
    mutationFn: (layoutId: string) =>
      fetchVoidOrThrowWithUnauthorized(`/api/layouts/${layoutId}`, { method: "DELETE", headers: authHeaders() }, m.admin_error_delete_layout()),
    retry: false,
  });

  const createAreaMutation = useMutation({
    mutationFn: ({ label, icon, layoutId, widthM, lengthM, exhibitorId }: { label: string; icon: string; layoutId: string; widthM: number; lengthM: number; exhibitorId?: number }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/areas",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ label, icon, layout_id: layoutId, width_m: widthM, length_m: lengthM, x: 10, y: 10, exhibitor_id: exhibitorId ?? null }),
        },
        m.admin_error_add_area(),
      ),
    retry: false,
  });

  const updateAreaLabelMutation = useMutation({
    mutationFn: ({ areaId, label }: { areaId: string; label: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ label }) },
        "Failed to persist area label.",
      ),
    onMutate: ({ areaId, label }: { areaId: string; label: string }) => {
      const previousData = queryClient.getQueryData<AdminDashboardData>(currentDashboardQueryKey);
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (old: AdminDashboardData | undefined) =>
        old ? { ...old, areas: old.areas.map((a: FloorArea) => (a.id === areaId ? { ...a, label } : a)) } : old,
      );
      return { previousData };
    },
    onError: (_err: unknown, _vars: unknown, context: { previousData: AdminDashboardData | undefined } | undefined) => {
      if (context?.previousData) queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      console.error("Failed to persist area label");
    },
    retry: false,
  });

  const resizeAreaMutation = useMutation({
    mutationFn: ({ areaId, widthM, lengthM, x, y }: { areaId: string; widthM: number; lengthM: number; x: number; y: number }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ width_m: widthM, length_m: lengthM, x, y }) },
        m.admin_error_resize_area_status({ status: 500 }),
      ),
    onMutate: ({ areaId, widthM, lengthM, x, y }: { areaId: string; widthM: number; lengthM: number; x: number; y: number }) => {
      const previousData = queryClient.getQueryData<AdminDashboardData>(currentDashboardQueryKey);
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (old: AdminDashboardData | undefined) =>
        old ? { ...old, areas: old.areas.map((a: FloorArea) => (a.id === areaId ? { ...a, widthM, lengthM, x, y } : a)) } : old,
      );
      return { previousData };
    },
    onError: (_err: unknown, _vars: unknown, context: { previousData: AdminDashboardData | undefined } | undefined) => {
      if (context?.previousData) queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      console.error("Failed to persist area resize");
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
    onSuccess: (d: Record<string, unknown>, { areaId }: { areaId: string; body: Record<string, unknown> }) => {
      updateDashboardField("areas", (prev: FloorArea[]) =>
        prev.map((a: FloorArea) => (a.id === areaId ? apiAreaToArea(d) : a)),
      );
    },
    retry: false,
  });

  const moveAreaMutation = useMutation({
    mutationFn: ({ areaId, x, y }: { areaId: string; x: number; y: number }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ x, y }) },
        "Failed to persist area position.",
      ),
    onMutate: ({ areaId, x, y }: { areaId: string; x: number; y: number }) => {
      const previousData = queryClient.getQueryData<AdminDashboardData>(currentDashboardQueryKey);
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (old: AdminDashboardData | undefined) =>
        old ? { ...old, areas: old.areas.map((a: FloorArea) => (a.id === areaId ? { ...a, x, y } : a)) } : old,
      );
      return { previousData };
    },
    onError: (_err: unknown, _vars: unknown, context: { previousData: AdminDashboardData | undefined } | undefined) => {
      if (context?.previousData) queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      console.error("Failed to persist area position");
    },
    retry: false,
  });

  const rotateAreaMutation = useMutation({
    mutationFn: ({ areaId, rotation }: { areaId: string; rotation: number }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ rotation }) },
        "Failed to persist area rotation.",
      ),
    onMutate: ({ areaId, rotation }: { areaId: string; rotation: number }) => {
      const previousData = queryClient.getQueryData<AdminDashboardData>(currentDashboardQueryKey);
      queryClient.setQueryData<AdminDashboardData>(currentDashboardQueryKey, (old: AdminDashboardData | undefined) =>
        old ? { ...old, areas: old.areas.map((a: FloorArea) => (a.id === areaId ? { ...a, rotation } : a)) } : old,
      );
      return { previousData };
    },
    onError: (_err: unknown, _vars: unknown, context: { previousData: AdminDashboardData | undefined } | undefined) => {
      if (context?.previousData) queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      console.error("Failed to persist area rotation");
    },
    retry: false,
  });

  const deleteAreaMutation = useMutation({
    mutationFn: (areaId: string) =>
      fetchVoidOrThrowWithUnauthorized(`/api/areas/${areaId}`, { method: "DELETE", headers: authHeaders() }, m.admin_error_delete_area()),
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
    retry: false,
  });

  const registrationDetailMutation = useMutation({
    mutationFn: (registrationId: string) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/registrations/${registrationId}`,
        { headers: authHeaders() },
        m.admin_error_load_data(),
      ),
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
        return key === "admin-dashboard" || key === "admin";
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
      updateDashboardField("people", (prev) =>
        prev
          .filter((p) => p.id !== duplicateId)
          .map((p) => (p.id === canonicalId ? mergedCanonical : p)),
      );
      updateDashboardField("members", (prev) =>
        syncMembersWithPerson(
          prev.filter((member) => member.id !== duplicateId),
          mergedCanonical,
        ),
      );
      // Re-point any registrations in state that were on the duplicate;
      // also refresh person data on any already-canonical registrations (merged fields may have changed).
      updateDashboardField("registrations", (prev) =>
        prev.map((r) =>
          r.personId === duplicateId
            ? { ...r, personId: canonicalId, person: canonicalPerson }
            : r.personId === canonicalId
              ? { ...r, person: canonicalPerson }
              : r,
        ),
      );
      // Re-point any exhibitors in state that were linked to the duplicate contact person
      updateDashboardField("exhibitors", (prev) =>
        prev.map((ex) =>
          ex.contactPersonId === duplicateId ? { ...ex, contactPersonId: canonicalId } : ex,
        ),
      );
    },
    [mergePeopleMutation, people, updateDashboardField],
  );

  const handleCreateMember = useCallback(
    async (data: MemberFormData) => {
      const d = await createMemberMutation.mutateAsync(data);
      const createdMember = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("members", (prev) => [createdMember, ...prev]);
      updateDashboardField("people", (prev) => [createdMember, ...prev]);
    },
    [createMemberMutation, updateDashboardField],
  );

  const handleUpdateMember = useCallback(
    async (id: string, data: MemberFormData) => {
      const d = await updateMemberMutation.mutateAsync({ id, data });
      const updatedMember = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("members", (prev) =>
        prev.map((member) => (member.id === id ? updatedMember : member)),
      );
      updateDashboardField("people", (prev) => replacePersonById(prev, updatedMember));
      updateDashboardField("registrations", (prev) =>
        prev.map((r) =>
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
        ),
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
    [updateDashboardField, updateMemberMutation],
  );

  const handleDeleteMember = useCallback(
    async (id: string) => {
      await deleteMemberMutation.mutateAsync(id);
      updateDashboardField("members", (prev) => prev.filter((member) => member.id !== id));
      updateDashboardField("people", (prev) => prev.filter((person) => person.id !== id));
    },
    [deleteMemberMutation, updateDashboardField],
  );

  const handleCreatePerson = useCallback(
    async (data: PersonFormData) => {
      const d = await createPersonMutation.mutateAsync(data);
      const createdPerson = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("people", (prev) => [createdPerson, ...prev]);
      updateDashboardField("members", (prev) => syncMembersWithPerson(prev, createdPerson));
    },
    [createPersonMutation, updateDashboardField],
  );

  const handleUpdatePerson = useCallback(
    async (id: string, data: PersonFormData) => {
      const d = await updatePersonMutation.mutateAsync({ id, data });
      const updated = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("people", (prev) => replacePersonById(prev, updated));
      updateDashboardField("members", (prev) => syncMembersWithPerson(prev, updated));
      updateDashboardField("registrations", (prev) =>
        prev.map((r) =>
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
        ),
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
    [updateDashboardField, updatePersonMutation],
  );

  const handleDeletePerson = useCallback(
    async (id: string) => {
      await deletePersonMutation.mutateAsync(id);
      updateDashboardField("people", (prev) => prev.filter((p) => p.id !== id));
      updateDashboardField("members", (prev) => prev.filter((member) => member.id !== id));
    },
    [deletePersonMutation, updateDashboardField],
  );

  const handleCreateVolunteer = useCallback(
    async (data: VolunteerFormData) => {
      const d = await createVolunteerMutation.mutateAsync(data);
      const createdVolunteer = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("people", (prev) => [
        mergeVolunteerPerson(undefined, createdVolunteer),
        ...prev,
      ]);
    },
    [createVolunteerMutation, updateDashboardField],
  );

  const handleUpdateVolunteer = useCallback(
    async (id: string, data: VolunteerFormData) => {
      const d = await updateVolunteerMutation.mutateAsync({ id, data });
      const updatedVolunteer = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("people", (prev) => replaceVolunteerById(prev, updatedVolunteer));
      updateDashboardField("members", (prev) =>
        prev.map((member) =>
          member.id === id
            ? {
                ...member,
                name: updatedVolunteer.name,
                address: updatedVolunteer.address,
                active: updatedVolunteer.active,
                updatedAt: updatedVolunteer.updatedAt,
              }
            : member,
        ),
      );
    },
    [updateDashboardField, updateVolunteerMutation],
  );

  const handleDeleteVolunteer = useCallback(
    async (id: string) => {
      await deleteVolunteerMutation.mutateAsync(id);
      // The person record is preserved (soft archive); only the volunteer role
      // and help periods are removed.  Update local state accordingly so that
      // the person remains visible in People/Members tabs if applicable.
      updateDashboardField("people", (prev) =>
        prev.map((person) =>
          person.id !== id
            ? person
            : { ...person, roles: person.roles.filter((r) => r !== "volunteer"), helpPeriods: [] },
        ),
      );
    },
    [deleteVolunteerMutation, updateDashboardField],
  );

  const handleExhibitorSaved = useCallback((item: ItemDraft) => {
    updateDashboardField("exhibitors", (prev) => {
      const entry = {
        id: item.id,
        name: item.name,
        active: item.active ?? true,
        contactPersonId: item.contactPersonId ?? null,
      };
      const idx = prev.findIndex((e) => e.id === item.id);
      if (idx >= 0) {
        return prev.map((e) => (e.id === item.id ? entry : e));
      }
      return [...prev, entry];
    });
  }, [updateDashboardField]);

  const handleExhibitorDeleted = useCallback((id: number) => {
    updateDashboardField("exhibitors", (prev) => prev.filter((e) => e.id !== id));
  }, [updateDashboardField]);

  const volunteers = useMemo(
    () => people.filter((person) => person.roles.includes("volunteer")),
    [people],
  );

  useEffect(() => {
    if (dashboardQuery.data) {
      setError("");
    }
  }, [dashboardQuery.data]);

  useEffect(() => {
    if (!dashboardQuery.error) {
      return;
    }

    if (dashboardQuery.error instanceof Error && dashboardQuery.error.message === "unauthorized") {
      sessionStorage.removeItem("adminToken");
      storedTokenRef.current = "";
      setIsAuthenticated(false);
      setLoginError(m.admin_login_error());
      return;
    }

    console.error("Failed to load dashboard data", dashboardQuery.error);
    setError(m.admin_error_load_data());
  }, [dashboardQuery.error]);

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
        updateDashboardField("registrations", (prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: updated.status, updatedAt: updated.updatedAt } : r)),
        );
        setDetailRegistration((prev) => (prev?.id === id ? { ...prev, status: updated.status, updatedAt: updated.updatedAt } : prev));
      } catch (err) {
        console.error("Failed to update registration status", err);
        setError(err instanceof Error ? err.message : m.admin_error_update_registration());
      }
    },
    [updateDashboardField, updateRegistrationMutation],
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
        updateDashboardField("registrations", (prev) =>
          prev.map((r) => (r.id === id ? { ...r, paymentStatus: updated.paymentStatus, updatedAt: updated.updatedAt } : r)),
        );
        setDetailRegistration((prev) => (prev?.id === id ? { ...prev, paymentStatus: updated.paymentStatus, updatedAt: updated.updatedAt } : prev));
      } catch (err) {
        console.error("Failed to update payment status", err);
        setError(err instanceof Error ? err.message : m.admin_error_update_payment());
      }
    },
    [updateDashboardField, updateRegistrationMutation],
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
        updateDashboardField("registrations", (prev) =>
          prev.map((r) => (r.id === registrationId ? { ...r, tableId: updated.tableId, updatedAt: updated.updatedAt } : r)),
        );

        updateDashboardField("tables", (prevTables) =>
          prevTables.map((t) => {
            const wasAssigned = t.registrationIds.includes(registrationId);
            const shouldBeAssigned = t.id === updated.tableId;
            if (wasAssigned && !shouldBeAssigned) {
              return { ...t, registrationIds: t.registrationIds.filter((id) => id !== registrationId) };
            }
            if (!wasAssigned && shouldBeAssigned) {
              return { ...t, registrationIds: [...t.registrationIds, registrationId] };
            }
            return t;
          }),
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? { ...prev, tableId: updated.tableId, updatedAt: updated.updatedAt } : prev));
      } catch (err) {
        console.error("Failed to assign table", err);
        setError(err instanceof Error ? err.message : m.admin_error_assign_table());
      }
    },
    [updateDashboardField, updateRegistrationMutation],
  );

  const handleAddTable = useCallback(
    async (name: string, capacity: number, layoutId: string, tableTypeId: string) => {
      const data = await createTableMutation.mutateAsync({ name, capacity, layoutId, tableTypeId });
      const table = (data.table ?? data) as Record<string, unknown>;
      updateDashboardField("tables", (prev) => [...prev, apiTableToTable(table)]);
    },
    [createTableMutation, updateDashboardField],
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
      updateDashboardField("tables", (prev) => prev.filter((t) => t.id !== tableId));
    },
    [deleteTableMutation, updateDashboardField],
  );

  const handleAddVenue = useCallback(
    async (name: string, address: string, city: string, postalCode: string, country: string) => {
      const d = await createVenueMutation.mutateAsync({ name, address, city, postalCode, country });
      updateDashboardField("venues", (prev) => [...prev, apiVenueToVenue(d)]);
    },
    [createVenueMutation, updateDashboardField],
  );

  const handleArchiveVenue = useCallback(
    async (venueId: string) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, active: false });
      updateDashboardField("venues", (prev) =>
        prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)),
      );
    },
    [updateDashboardField, updateVenueMutation],
  );

  const handleRestoreVenue = useCallback(
    async (venueId: string) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, active: true });
      updateDashboardField("venues", (prev) =>
        prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)),
      );
    },
    [updateDashboardField, updateVenueMutation],
  );

  const handleDeleteVenue = useCallback(
    async (venueId: string) => {
      await deleteVenueMutation.mutateAsync(venueId);
      updateDashboardField("venues", (prev) => prev.filter((v) => v.id !== venueId));
      // Cascade: remove rooms and their layouts/tables from local state
      const venueRoomIds = rooms.filter((r) => r.venueId === venueId).map((r) => r.id);
      updateDashboardField("rooms", (prev) => prev.filter((r) => r.venueId !== venueId));
      const venueLayoutIds = layouts
        .filter((l) => venueRoomIds.includes(l.roomId ?? ""))
        .map((l) => l.id);
      updateDashboardField("layouts", (prev) =>
        prev.filter((l) => !venueRoomIds.includes(l.roomId ?? "")),
      );
      updateDashboardField("tables", (prev) =>
        prev.filter((t) => !venueLayoutIds.includes(t.layoutId)),
      );
      updateDashboardField("areas", (prev) =>
        prev.filter((a) => !venueLayoutIds.includes(a.layoutId)),
      );
    },
    [deleteVenueMutation, layouts, rooms, updateDashboardField],
  );

  const handleAddRoom = useCallback(
    async (venueId: string, name: string, widthM: number, lengthM: number, color: string) => {
      const data = await createRoomMutation.mutateAsync({ venueId, name, widthM, lengthM, color });
      updateDashboardField("rooms", (prev) => [...prev, apiRoomToRoom(data)]);
    },
    [createRoomMutation, updateDashboardField],
  );

  const handleArchiveRoom = useCallback(
    async (roomId: string) => {
      const data = await updateRoomMutation.mutateAsync({ roomId, active: false, fallbackMessage: m.admin_error_delete_room() });
      updateDashboardField("rooms", (prev) =>
        prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)),
      );
    },
    [updateDashboardField, updateRoomMutation],
  );

  const handleRestoreRoom = useCallback(
    async (roomId: string) => {
      const data = await updateRoomMutation.mutateAsync({ roomId, active: true, fallbackMessage: m.admin_content_error_save() });
      updateDashboardField("rooms", (prev) =>
        prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)),
      );
    },
    [updateDashboardField, updateRoomMutation],
  );

  const handleAddLayout = useCallback(
    async (roomId: string, date: string, label?: string) => {
      const d = await createLayoutMutation.mutateAsync({ roomId, date, label });
      updateDashboardField("layouts", (prev) => [...prev, apiLayoutToLayout(d)]);
    },
    [createLayoutMutation, updateDashboardField],
  );

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      await deleteLayoutMutation.mutateAsync(layoutId);
      updateDashboardField("layouts", (prev) => prev.filter((l) => l.id !== layoutId));
      updateDashboardField("tables", (prev) => prev.filter((t) => t.layoutId !== layoutId));
      updateDashboardField("areas", (prev) => prev.filter((a) => a.layoutId !== layoutId));
    },
    [deleteLayoutMutation, updateDashboardField],
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
      const data = await createAreaMutation.mutateAsync({ label, icon, layoutId, widthM, lengthM, exhibitorId });
      updateDashboardField("areas", (prev) => [...prev, apiAreaToArea(data)]);
    },
    [createAreaMutation, updateDashboardField],
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
      updateDashboardField("areas", (prev) => prev.filter((a) => a.id !== areaId));
    },
    [deleteAreaMutation, updateDashboardField],
  );

  const handleAssignAreaToItem = useCallback(
    (areaId: string, exhibitorId: number | null, label?: string, icon?: string) => {
      const body: Record<string, unknown> = { exhibitor_id: exhibitorId };
      if (label !== undefined) body.label = label;
      if (icon !== undefined) body.icon = icon;
      return assignAreaMutation.mutateAsync({ areaId, body });
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
    (tableId: string, tableTypeId: string) => changeTableTypeMutation.mutateAsync({ tableId, tableTypeId }),
    [changeTableTypeMutation],
  );

  const handleUpdateTable = useCallback(
    (tableId: string, name: string) => updateTableNameMutation.mutateAsync({ tableId, name }),
    [updateTableNameMutation],
  );

  const handleResizeArea = useCallback(
    (areaId: string, widthM: number, lengthM: number) => {
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

      return resizeAreaMutation.mutateAsync({ areaId, widthM, lengthM, x, y });
    },
    [areas, layouts, rooms, resizeAreaMutation],
  );

  const handleAddRegistration = useCallback((registration: Registration) => {
    updateDashboardField("registrations", (prev) => [registration, ...prev]);
  }, [updateDashboardField]);

  const handleAddTableType = useCallback(
    async (data: Omit<TableType, "id">) => {
      const d = await createTableTypeMutation.mutateAsync(data);
      updateDashboardField("tableTypes", (prev) => [...prev, apiTableTypeToTableType(d)]);
    },
    [createTableTypeMutation, updateDashboardField],
  );

  const handleUpdateTableType = useCallback(
    async (id: string, data: Partial<Omit<TableType, "id">>) => {
      const d = await updateTableTypeMutation.mutateAsync({ id, data });
      updateDashboardField("tableTypes", (prev) =>
        prev.map((tt) => (tt.id === id ? apiTableTypeToTableType(d) : tt)),
      );
    },
    [updateDashboardField, updateTableTypeMutation],
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
        const data = await registrationDetailMutation.mutateAsync(res.id);
        setDetailRegistration(apiToRegistration(data as Record<string, unknown>));
      } catch (err) {
        console.error("Failed to fetch registration detail, falling back to list data", err);
        setDetailRegistration(res);
      }
    },
    [registrationDetailMutation],
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
        updateDashboardField("registrations", (prev) => prev.map((r) => (r.id === registrationId ? updated : r)));
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        console.error("Failed to update bottle delivery status", err);
        setError(err instanceof Error ? err.message : m.admin_error_bottle_delivery());
      }
    },
    [updateDashboardField, updateRegistrationMutation],
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
        updateDashboardField("registrations", (prev) => prev.map((r) => (r.id === registrationId ? updated : r)));
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        console.error("Failed to check in guest", err);
        setError(err instanceof Error ? err.message : m.admin_error_check_in());
      }
    },
    [updateDashboardField, updateRegistrationMutation],
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
        updateDashboardField("registrations", (prev) => prev.map((r) => (r.id === registrationId ? updated : r)));
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        console.error("Failed to issue strap", err);
        setError(err instanceof Error ? err.message : m.admin_error_issue_strap());
      }
    },
    [updateDashboardField, updateRegistrationMutation],
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
                  disabled={dashboardQuery.isFetching}
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

            {dashboardQuery.isPending ? (
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
                      <span className="badge bg-warning text-dark ms-2">{registrations.length}</span>
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
                          dashboardQuery.refetch(),
                          queryClient.invalidateQueries({ queryKey: activeEditionQueryKey }),
                          queryClient.invalidateQueries({ queryKey: queryKeys.admin.activeEditionEvents }),
                        ]);
                      }}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="people">
                    <PeopleManagement
                      people={people}
                      registrationCountByPersonId={registrationCountByPersonId}
                      isLoading={dashboardQuery.isFetching}
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
                      isLoading={dashboardQuery.isFetching}
                      onCreate={handleCreateMember}
                      onUpdate={handleUpdateMember}
                      onDelete={handleDeleteMember}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="volunteers">
                    <VolunteersManagement
                      volunteers={volunteers}
                      isLoading={dashboardQuery.isFetching}
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

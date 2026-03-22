import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useActiveEdition } from "@/hooks/useActiveEdition";
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
  const response = await fetch("/api/members", { headers: authHeaders() });
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_error_load_data());
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload.map(apiToPerson) : [];
}

async function loadVolunteers(
  authHeaders: () => Record<string, string>,
): Promise<Person[]> {
  const response = await fetch("/api/volunteers", { headers: authHeaders() });
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_error_load_data());
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload.map(apiToPerson) : [];
}

async function fetchAdminDashboardData(
  authHeaders: () => Record<string, string>,
): Promise<AdminDashboardData> {
  const [
    registrationsResponse,
    tablesResponse,
    venuesResponse,
    roomsResponse,
    tableTypesResponse,
    layoutsResponse,
    exhibitorsResponse,
    areasResponse,
    peopleResponse,
    members,
    volunteers,
  ] = await Promise.all([
    fetch("/api/registrations", { headers: authHeaders() }),
    fetch("/api/tables", { headers: authHeaders() }),
    fetch("/api/venues", { headers: authHeaders() }),
    fetch("/api/rooms", { headers: authHeaders() }),
    fetch("/api/table-types", { headers: authHeaders() }),
    fetch("/api/layouts", { headers: authHeaders() }),
    fetch("/api/exhibitors", { headers: authHeaders() }),
    fetch("/api/areas", { headers: authHeaders() }),
    fetch("/api/people", { headers: authHeaders() }),
    loadMembers(authHeaders),
    loadVolunteers(authHeaders),
  ]);

  const responses = [
    registrationsResponse,
    tablesResponse,
    venuesResponse,
    roomsResponse,
    tableTypesResponse,
    layoutsResponse,
    exhibitorsResponse,
    areasResponse,
    peopleResponse,
  ];

  if (responses.some((response) => response.status === 401)) {
    throw new Error("unauthorized");
  }

  const firstFailed = responses.find((response) => !response.ok);
  if (firstFailed) {
    throw new Error(`dashboard-load-failed:${firstFailed.status}`);
  }

  const registrationsPayload = await registrationsResponse.json();
  const rawRegistrations: Record<string, unknown>[] = Array.isArray(registrationsPayload)
    ? registrationsPayload
    : [];

  const tablesPayload = await tablesResponse.json();
  const rawTables: Record<string, unknown>[] = Array.isArray(tablesPayload)
    ? tablesPayload
    : (tablesPayload.tables ?? []);

  const venuesPayload = await venuesResponse.json();
  const roomsPayload = await roomsResponse.json();
  const tableTypesPayload = await tableTypesResponse.json();
  const layoutsPayload = await layoutsResponse.json();
  const exhibitorsPayload = await exhibitorsResponse.json();
  const areasPayload = await areasResponse.json();
  const peoplePayload = await peopleResponse.json();
  const nextPeople = Array.isArray(peoplePayload) ? peoplePayload.map(apiToPerson) : [];

  return {
    registrations: rawRegistrations.map(apiToRegistration),
    tables: rawTables.map(apiTableToTable),
    venues: Array.isArray(venuesPayload) ? venuesPayload.map(apiVenueToVenue) : [],
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

  const validateToken = useCallback(
    async (tokenToValidate: string): Promise<"valid" | "invalid" | "transientError"> => {
      try {
        const response = await fetch("/api/registrations", {
          headers: { Authorization: `Bearer ${tokenToValidate}` },
        });

        if (response.ok) {
          return "valid";
        }

        // Auth failures: 401 Unauthorized, 403 Forbidden
        if (response.status === 401 || response.status === 403) {
          return "invalid";
        }

        // Server errors (5xx) are transient
        if (response.status >= 500) {
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
          setLoginError("Server temporarily unavailable. Please try again.");
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
      const response = await fetch(`/api/people/${canonicalId}/merge/${duplicateId}`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? m.admin_people_merge_error());
      }
      const updated = await response.json();
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
    [authHeaders, people, updateDashboardField],
  );

  const handleCreateMember = useCallback(
    async (data: MemberFormData) => {
      const response = await fetch("/api/members", {
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
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_members_error_create());
      }
      const d = await response.json();
      const createdMember = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("members", (prev) => [createdMember, ...prev]);
      updateDashboardField("people", (prev) => [createdMember, ...prev]);
    },
    [authHeaders, updateDashboardField],
  );

  const handleUpdateMember = useCallback(
    async (id: string, data: MemberFormData) => {
      const response = await fetch(`/api/members/${id}`, {
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
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_members_error_update());
      }
      const d = await response.json();
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
    [authHeaders, updateDashboardField],
  );

  const handleDeleteMember = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/members/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_members_error_delete());
      }
      updateDashboardField("members", (prev) => prev.filter((member) => member.id !== id));
      updateDashboardField("people", (prev) => prev.filter((person) => person.id !== id));
    },
    [authHeaders, updateDashboardField],
  );

  const handleCreatePerson = useCallback(
    async (data: PersonFormData) => {
      const response = await fetch("/api/people", {
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
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_people_error_create());
      }
      const d = await response.json();
      const createdPerson = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("people", (prev) => [createdPerson, ...prev]);
      updateDashboardField("members", (prev) => syncMembersWithPerson(prev, createdPerson));
    },
    [authHeaders, updateDashboardField],
  );

  const handleUpdatePerson = useCallback(
    async (id: string, data: PersonFormData) => {
      const response = await fetch(`/api/people/${id}`, {
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
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_people_error_update());
      }
      const d = await response.json();
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
    [authHeaders, updateDashboardField],
  );

  const handleDeletePerson = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/people/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_delete_person());
      }
      updateDashboardField("people", (prev) => prev.filter((p) => p.id !== id));
      updateDashboardField("members", (prev) => prev.filter((member) => member.id !== id));
    },
    [authHeaders, updateDashboardField],
  );

  const handleCreateVolunteer = useCallback(
    async (data: VolunteerFormData) => {
      const response = await fetch("/api/volunteers", {
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
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_volunteers_error_create());
      }
      const d = await response.json();
      const createdVolunteer = apiToPerson(d as Record<string, unknown>);
      updateDashboardField("people", (prev) => [
        mergeVolunteerPerson(undefined, createdVolunteer),
        ...prev,
      ]);
    },
    [authHeaders, updateDashboardField],
  );

  const handleUpdateVolunteer = useCallback(
    async (id: string, data: VolunteerFormData) => {
      const response = await fetch(`/api/volunteers/${id}`, {
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
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_volunteers_error_update());
      }
      const d = await response.json();
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
    [authHeaders, updateDashboardField],
  );

  const handleDeleteVolunteer = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/volunteers/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_volunteers_error_delete());
      }
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
    [authHeaders, updateDashboardField],
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
          setLoginError("Server temporarily unavailable. Please refresh or try logging in again.");
        }
      })
      .catch((err) => {
        // Unexpected error in the effect itself
        console.error("Auto-authentication exception:", err);
        setLoginError("Failed to authenticate. Please log in manually.");
      });
  }, [isAuthenticated, validateToken]);

  const handleUpdateStatus = useCallback(
    async (id: string, status: RegistrationStatus) => {
      try {
        const response = await fetch(`/api/registrations/${id}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ status }),
        });
        if (response.ok) {
          updateDashboardField("registrations", (prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r,
            ),
          );
        }
      } catch (err) {
        console.error("Failed to update registration status", err);
        setError(m.admin_error_update_reservation());
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleUpdatePayment = useCallback(
    async (id: string, paymentStatus: PaymentStatus) => {
      try {
        const response = await fetch(`/api/registrations/${id}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ payment_status: paymentStatus }),
        });
        if (response.ok) {
          updateDashboardField("registrations", (prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, paymentStatus, updatedAt: new Date().toISOString() } : r,
            ),
          );
        }
      } catch (err) {
        console.error("Failed to update payment status", err);
        setError(m.admin_error_update_payment());
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleAssignTable = useCallback(
    async (registrationId: string, tableId: string | undefined) => {
      try {
        const response = await fetch(`/api/registrations/${registrationId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ table_id: tableId ?? null }),
        });
        if (response.ok) {
          updateDashboardField("registrations", (prev) =>
            prev.map((r) =>
              r.id === registrationId ? { ...r, tableId, updatedAt: new Date().toISOString() } : r,
            ),
          );

          // Update the tables' registrationIds lists
          updateDashboardField("tables", (prevTables) =>
            prevTables.map((t) => {
              const wasAssigned = t.registrationIds.includes(registrationId);
              const shouldBeAssigned = t.id === tableId;
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
            }),
          );
        }
      } catch (err) {
        console.error("Failed to assign table", err);
        setError(m.admin_error_assign_table());
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleAddTable = useCallback(
    async (name: string, capacity: number, layoutId: string, tableTypeId: string) => {
      const response = await fetch("/api/tables", {
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
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? m.admin_error_add_table());
      }
      const data = await response.json();
      const table = data.table ?? data;
      updateDashboardField("tables", (prev) => [...prev, apiTableToTable(table)]);
    },
    [authHeaders, updateDashboardField],
  );

  const handleMoveTable = useCallback(
    async (tableId: string, x: number, y: number) => {
      // Optimistic update
      updateDashboardField("tables", (prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, x, y } : t)),
      );
      try {
        await fetch(`/api/tables/${tableId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ x, y }),
        });
      } catch (err) {
        // Non-critical: position will persist until next reload
        console.error("Failed to persist table position", err);
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleRotateTable = useCallback(
    async (tableId: string, rotation: number) => {
      // Normalise to [0, 360)
      const normalised = ((rotation % 360) + 360) % 360;
      updateDashboardField("tables", (prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, rotation: normalised } : t)),
      );
      try {
        await fetch(`/api/tables/${tableId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ rotation: normalised }),
        });
      } catch (err) {
        console.error("Failed to persist table rotation", err);
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? m.admin_error_delete_table());
      }
      updateDashboardField("tables", (prev) => prev.filter((t) => t.id !== tableId));
    },
    [authHeaders, updateDashboardField],
  );

  const handleAddVenue = useCallback(
    async (name: string, address: string, city: string, postalCode: string, country: string) => {
      const response = await fetch("/api/venues", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, address, city, postal_code: postalCode, country }),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_add_venue());
      }
      const d = await response.json();
      updateDashboardField("venues", (prev) => [...prev, apiVenueToVenue(d)]);
    },
    [authHeaders, updateDashboardField],
  );

  const handleArchiveVenue = useCallback(
    async (venueId: string) => {
      const response = await fetch(`/api/venues/${venueId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ active: false }),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_archive_venue());
      }
      const d = await response.json();
      updateDashboardField("venues", (prev) =>
        prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)),
      );
    },
    [authHeaders, updateDashboardField],
  );

  const handleRestoreVenue = useCallback(
    async (venueId: string) => {
      const response = await fetch(`/api/venues/${venueId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ active: true }),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_restore_venue());
      }
      const d = await response.json();
      updateDashboardField("venues", (prev) =>
        prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)),
      );
    },
    [authHeaders, updateDashboardField],
  );

  const handleDeleteVenue = useCallback(
    async (venueId: string) => {
      const response = await fetch(`/api/venues/${venueId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_delete_venue());
      }
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
    },
    [authHeaders, layouts, rooms, updateDashboardField],
  );

  const handleAddRoom = useCallback(
    async (venueId: string, name: string, widthM: number, lengthM: number, color: string) => {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          venue_id: venueId,
          name,
          width_m: widthM,
          length_m: lengthM,
          color,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? m.admin_error_add_room());
      }
      const data = await response.json();
      updateDashboardField("rooms", (prev) => [...prev, apiRoomToRoom(data)]);
    },
    [authHeaders, updateDashboardField],
  );

  const handleArchiveRoom = useCallback(
    async (roomId: string) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ active: false }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? m.admin_error_delete_room());
      }
      const data = await response.json();
      updateDashboardField("rooms", (prev) =>
        prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)),
      );
    },
    [authHeaders, updateDashboardField],
  );

  const handleRestoreRoom = useCallback(
    async (roomId: string) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ active: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
      }
      const data = await response.json();
      updateDashboardField("rooms", (prev) =>
        prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)),
      );
    },
    [authHeaders, updateDashboardField],
  );

  const handleAddLayout = useCallback(
    async (roomId: string, date: string, label?: string) => {
      const response = await fetch("/api/layouts", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          edition_id: activeEdition.id,
          room_id: roomId,
          date,
          ...(label?.trim() ? { label: label.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_add_layout());
      }
      const d = await response.json();
      updateDashboardField("layouts", (prev) => [...prev, apiLayoutToLayout(d)]);
    },
    [activeEdition.id, authHeaders, updateDashboardField],
  );

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      const response = await fetch(`/api/layouts/${layoutId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_delete_layout());
      }
      updateDashboardField("layouts", (prev) => prev.filter((l) => l.id !== layoutId));
      updateDashboardField("tables", (prev) => prev.filter((t) => t.layoutId !== layoutId));
      updateDashboardField("areas", (prev) => prev.filter((a) => a.layoutId !== layoutId));
    },
    [authHeaders, updateDashboardField],
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
      const response = await fetch("/api/areas", {
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
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? "Failed to add area.");
      }
      const data = await response.json();
      updateDashboardField("areas", (prev) => [...prev, apiAreaToArea(data)]);
    },
    [authHeaders, updateDashboardField],
  );

  const handleMoveArea = useCallback(
    async (areaId: string, x: number, y: number) => {
      const prev = areas.find((a) => a.id === areaId);
      updateDashboardField("areas", (prevAreas) =>
        prevAreas.map((a) => (a.id === areaId ? { ...a, x, y } : a)),
      );
      try {
        const response = await fetch(`/api/areas/${areaId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ x, y }),
        });
        if (!response.ok) {
          if (prev)
            updateDashboardField("areas", (prevAreas) =>
              prevAreas.map((a) => (a.id === areaId ? { ...a, x: prev.x, y: prev.y } : a)),
            );
          const data = await response.json().catch(() => ({}));
          throw new Error(
            (data as { detail?: string }).detail ?? "Failed to persist area position.",
          );
        }
      } catch (err) {
        console.error("Failed to persist area position", err);
      }
    },
    [areas, authHeaders, updateDashboardField],
  );

  const handleRotateArea = useCallback(
    async (areaId: string, rotation: number) => {
      const prev = areas.find((a) => a.id === areaId);
      const normalised = ((rotation % 360) + 360) % 360;
      updateDashboardField("areas", (prevAreas) =>
        prevAreas.map((a) => (a.id === areaId ? { ...a, rotation: normalised } : a)),
      );
      try {
        const response = await fetch(`/api/areas/${areaId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ rotation: normalised }),
        });
        if (!response.ok) {
          if (prev)
            updateDashboardField("areas", (prevAreas) =>
              prevAreas.map((a) => (a.id === areaId ? { ...a, rotation: prev.rotation } : a)),
            );
          const data = await response.json().catch(() => ({}));
          throw new Error(
            (data as { detail?: string }).detail ?? "Failed to persist area rotation.",
          );
        }
      } catch (err) {
        console.error("Failed to persist area rotation", err);
      }
    },
    [areas, authHeaders, updateDashboardField],
  );

  const handleDeleteArea = useCallback(
    async (areaId: string) => {
      const response = await fetch(`/api/areas/${areaId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? "Failed to delete area.");
      }
      updateDashboardField("areas", (prev) => prev.filter((a) => a.id !== areaId));
    },
    [authHeaders, updateDashboardField],
  );

  const handleAssignAreaToItem = useCallback(
    async (areaId: string, exhibitorId: number | null, label?: string, icon?: string) => {
      const body: Record<string, unknown> = {
        exhibitor_id: exhibitorId,
      };
      if (label !== undefined) body.label = label;
      if (icon !== undefined) body.icon = icon;
      const response = await fetch(`/api/areas/${areaId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? "Failed to assign area.");
      }
      const d = await response.json();
      updateDashboardField("areas", (prev) =>
        prev.map((a) => (a.id === areaId ? apiAreaToArea(d) : a)),
      );
    },
    [authHeaders, updateDashboardField],
  );

  const handleUpdateAreaLabel = useCallback(
    async (areaId: string, label: string) => {
      updateDashboardField("areas", (prev) =>
        prev.map((a) => (a.id === areaId ? { ...a, label } : a)),
      );
      try {
        await fetch(`/api/areas/${areaId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ label }),
        });
      } catch (err) {
        console.error("Failed to persist area label", err);
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleChangeTableType = useCallback(
    async (tableId: string, tableTypeId: string) => {
      let previousTable: FloorTable | undefined;
      updateDashboardField("tables", (prev) => {
        previousTable = prev.find((t) => t.id === tableId);
        return prev.map((t) => (t.id === tableId ? { ...t, tableTypeId } : t));
      });
      try {
        const response = await fetch(`/api/tables/${tableId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ table_type_id: tableTypeId }),
        });
        if (!response.ok) {
          const d = await response.json().catch(() => ({}));
          throw new Error(
            (d as { detail?: string }).detail ??
              m.admin_error_change_table_type_status({ status: response.status }),
          );
        }
      } catch (err) {
        console.error("Failed to persist table type change", err);
        if (previousTable !== undefined) {
          const snapshot = previousTable;
          updateDashboardField("tables", (prev) =>
            prev.map((t) => (t.id === tableId ? snapshot : t)),
          );
        }
        throw err;
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleUpdateTable = useCallback(
    async (tableId: string, name: string) => {
      let previousTable: FloorTable | undefined;
      updateDashboardField("tables", (prev) => {
        previousTable = prev.find((t) => t.id === tableId);
        return prev.map((t) => (t.id === tableId ? { ...t, name } : t));
      });
      try {
        const response = await fetch(`/api/tables/${tableId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ name }),
        });
        if (!response.ok) {
          const d = await response.json().catch(() => ({}));
          throw new Error(
            (d as { detail?: string }).detail ??
              m.admin_error_update_table_name_status({ status: response.status }),
          );
        }
      } catch (err) {
        if (previousTable !== undefined) {
          const snapshot = previousTable;
          updateDashboardField("tables", (prev) =>
            prev.map((t) => (t.id === tableId ? snapshot : t)),
          );
        }
        console.error("Failed to persist table name", err);
        throw err;
      }
    },
    [authHeaders, updateDashboardField],
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

      let previousArea: FloorArea | undefined;
      updateDashboardField("areas", (prev) => {
        previousArea = prev.find((a) => a.id === areaId);
        return prev.map((a) => (a.id === areaId ? { ...a, widthM, lengthM, x, y } : a));
      });
      try {
        const response = await fetch(`/api/areas/${areaId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ width_m: widthM, length_m: lengthM, x, y }),
        });
        if (!response.ok) {
          const d = await response.json().catch(() => ({}));
          throw new Error(
            (d as { detail?: string }).detail ??
              m.admin_error_resize_area_status({ status: response.status }),
          );
        }
      } catch (err) {
        if (previousArea !== undefined) {
          const snapshot = previousArea;
          updateDashboardField("areas", (prev) =>
            prev.map((a) => (a.id === areaId ? snapshot : a)),
          );
        }
        console.error("Failed to persist area resize", err);
        throw err;
      }
    },
    [areas, authHeaders, layouts, rooms, updateDashboardField],
  );

  const handleAddRegistration = useCallback((registration: Registration) => {
    updateDashboardField("registrations", (prev) => [registration, ...prev]);
  }, [updateDashboardField]);

  const handleAddTableType = useCallback(
    async (data: Omit<TableType, "id">) => {
      const response = await fetch("/api/table-types", {
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
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_add_table_type());
      }
      const d = await response.json();
      updateDashboardField("tableTypes", (prev) => [...prev, apiTableTypeToTableType(d)]);
    },
    [authHeaders, updateDashboardField],
  );

  const handleUpdateTableType = useCallback(
    async (id: string, data: Partial<Omit<TableType, "id">>) => {
      const response = await fetch(`/api/table-types/${id}`, {
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
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_update_table_type());
      }
      const d = await response.json();
      updateDashboardField("tableTypes", (prev) =>
        prev.map((tt) => (tt.id === id ? apiTableTypeToTableType(d) : tt)),
      );
    },
    [authHeaders, updateDashboardField],
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
        const response = await fetch(`/api/registrations/${res.id}`, {
          headers: authHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          setDetailRegistration(apiToRegistration(data as Record<string, unknown>));
        } else {
          // Fall back to the list version (no token available)
          setDetailRegistration(res);
        }
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
        const response = await fetch(`/api/registrations/${registrationId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            pre_orders: updatedOrders.map((o) => ({
              product_id: o.productId,
              name: o.name,
              quantity: o.quantity,
              price: o.price,
              category: o.category,
              delivered: o.delivered,
            })),
          }),
        });
        if (response.ok) {
          updateDashboardField("registrations", (prev) =>
            prev.map((r) =>
              r.id === registrationId
                ? { ...r, preOrders: updatedOrders, updatedAt: new Date().toISOString() }
                : r,
            ),
          );
          // Also update the detail modal
          setDetailRegistration((prev) =>
            prev?.id === registrationId ? { ...prev, preOrders: updatedOrders } : prev,
          );
        }
      } catch (err) {
        console.error("Failed to update bottle delivery status", err);
        setError(m.admin_error_bottle_delivery());
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleCheckIn = useCallback(
    async (registrationId: string) => {
      try {
        const response = await fetch(`/api/registrations/${registrationId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ checked_in: true }),
        });
        if (response.ok) {
          const data = await response.json();
          const updated = apiToRegistration(data as Record<string, unknown>);
          updateDashboardField("registrations", (prev) =>
            prev.map((r) =>
              r.id === registrationId
                ? { ...r, checkedIn: true, checkedInAt: updated.checkedInAt }
                : r,
            ),
          );
          setDetailRegistration((prev) =>
            prev?.id === registrationId
              ? { ...prev, checkedIn: true, checkedInAt: updated.checkedInAt }
              : prev,
          );
        }
      } catch (err) {
        console.error("Failed to check in guest", err);
        setError(m.admin_error_check_in());
      }
    },
    [authHeaders, updateDashboardField],
  );

  const handleIssueStrap = useCallback(
    async (registrationId: string) => {
      try {
        const response = await fetch(`/api/registrations/${registrationId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ strap_issued: true }),
        });
        if (response.ok) {
          updateDashboardField("registrations", (prev) =>
            prev.map((r) => (r.id === registrationId ? { ...r, strapIssued: true } : r)),
          );
          setDetailRegistration((prev) =>
            prev?.id === registrationId ? { ...prev, strapIssued: true } : prev,
          );
        }
      } catch (err) {
        console.error("Failed to issue strap", err);
        setError(m.admin_error_issue_strap());
      }
    },
    [authHeaders, updateDashboardField],
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
                      {m.admin_reservations_tab()}
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

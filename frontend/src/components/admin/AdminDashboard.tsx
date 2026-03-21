import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Container from "react-bootstrap/Container";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Tab from "react-bootstrap/Tab";
import Nav from "react-bootstrap/Nav";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import ReservationList from "./ReservationList";
import ReservationDetail from "./ReservationDetail";
import LayoutEditor from "./LayoutEditor";
import TableTypeManagement from "./TableTypeManagement";
import VenueManagement from "./VenueManagement";
import ContentManagement from "./ContentManagement";
import type { ItemDraft } from "./ItemModal";
import PeopleManagement from "./PeopleManagement";
import MembersManagement from "./MembersManagement";
import VolunteersManagement from "./VolunteersManagement";
import type { MemberFormData } from "./MemberFormModal";
import type { PersonFormData } from "./PersonFormModal";
import type { VolunteerFormData } from "./VolunteerFormModal";
import type { Reservation, ReservationStatus, PaymentStatus, OrderItem } from "@/types/reservation";
import { apiToReservation } from "@/types/reservationMapper";
import type { Room, FloorTable, FloorArea, TableType, Layout, Venue } from "@/types/admin";
import { type Person, apiToPerson } from "@/types/person";

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
    dayId: d.day_id as number,
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
    reservationIds: (d.reservation_ids as string[]) ?? [],
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

export default function AdminDashboard({ visible }: AdminDashboardProps) {
  const [token, setToken] = useState("");
  const storedTokenRef = useRef(sessionStorage.getItem("adminToken") ?? "");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const autoAuthRan = useRef(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tableTypes, setTableTypes] = useState<TableType[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [exhibitors, setExhibitors] = useState<
    { id: number; name: string; active: boolean; contactPersonId: string | null }[]
  >([]);
  const [areas, setAreas] = useState<FloorArea[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [filter, setFilter] = useState<"all" | ReservationStatus>("all");
  /** Full reservation (with checkInToken) shown in the detail modal */
  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null);

  const authHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${storedTokenRef.current}`,
    }),
    [],
  );

  const loadMembers = useCallback(async (): Promise<Person[]> => {
    const response = await fetch("/api/members", { headers: authHeaders() });
    if (response.status === 401) {
      throw new Error("unauthorized");
    }
    if (!response.ok) {
      const d = await response.json().catch(() => ({}));
      throw new Error((d as { detail?: string }).detail ?? m.admin_error_load_data());
    }
    const data = await response.json();
    return Array.isArray(data) ? data.map(apiToPerson) : [];
  }, [authHeaders]);

  const loadVolunteers = useCallback(async (): Promise<Person[]> => {
    const response = await fetch("/api/volunteers", { headers: authHeaders() });
    if (response.status === 401) {
      throw new Error("unauthorized");
    }
    if (!response.ok) {
      const d = await response.json().catch(() => ({}));
      throw new Error((d as { detail?: string }).detail ?? m.admin_error_load_data());
    }
    const data = await response.json();
    return Array.isArray(data) ? data.map(apiToPerson) : [];
  }, [authHeaders]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [
        resResponse,
        tablesResponse,
        venuesResponse,
        roomsResponse,
        tableTypesResponse,
        layoutsResponse,
        exhibitorsResponse,
        areasResponse,
        peopleResponse,
        membersData,
        volunteersData,
      ] = await Promise.all([
        fetch("/api/reservations", { headers: authHeaders() }),
        fetch("/api/tables", { headers: authHeaders() }),
        fetch("/api/venues", { headers: authHeaders() }),
        fetch("/api/rooms", { headers: authHeaders() }),
        fetch("/api/table-types", { headers: authHeaders() }),
        fetch("/api/layouts", { headers: authHeaders() }),
        fetch("/api/exhibitors", { headers: authHeaders() }),
        fetch("/api/areas", { headers: authHeaders() }),
        fetch("/api/people", { headers: authHeaders() }),
        loadMembers(),
        loadVolunteers(),
      ]);

      const responses = [
        resResponse,
        tablesResponse,
        venuesResponse,
        roomsResponse,
        tableTypesResponse,
        layoutsResponse,
        exhibitorsResponse,
        areasResponse,
        peopleResponse,
      ];

      if (responses.some((r) => r.status === 401)) {
        setIsAuthenticated(false);
        setLoginError(m.admin_login_error());
        return;
      }

      if (responses.some((r) => !r.ok)) {
        setError(m.admin_error_load_data());
        return;
      }

      const data = await resResponse.json();
      const rawRes: Record<string, unknown>[] = Array.isArray(data) ? data : [];
      setReservations(rawRes.map(apiToReservation));

      const tablesData = await tablesResponse.json();
      const rawTables: Record<string, unknown>[] = Array.isArray(tablesData)
        ? tablesData
        : (tablesData.tables ?? []);
      setTables(rawTables.map(apiTableToTable));

      const venuesData = await venuesResponse.json();
      setVenues(Array.isArray(venuesData) ? venuesData.map(apiVenueToVenue) : []);

      const roomsData = await roomsResponse.json();
      setRooms(Array.isArray(roomsData) ? roomsData.map(apiRoomToRoom) : []);

      const tableTypesData = await tableTypesResponse.json();
      setTableTypes(
        Array.isArray(tableTypesData) ? tableTypesData.map(apiTableTypeToTableType) : [],
      );

      const layoutsData = await layoutsResponse.json();
      setLayouts(Array.isArray(layoutsData) ? layoutsData.map(apiLayoutToLayout) : []);

      const exhibitorsData = await exhibitorsResponse.json();
      setExhibitors(
        Array.isArray(exhibitorsData)
          ? exhibitorsData.map((e: Record<string, unknown>) => ({
              id: e.id as number,
              name: e.name as string,
              active: (e.active ?? true) as boolean,
              contactPersonId: (e.contact_person_id as string | null) ?? null,
            }))
          : [],
      );

      const areasData = await areasResponse.json();
      setAreas(Array.isArray(areasData) ? areasData.map(apiAreaToArea) : []);

      const peopleData = await peopleResponse.json();
      const nextPeople = Array.isArray(peopleData) ? peopleData.map(apiToPerson) : [];
      setPeople(mergePeopleWithVolunteers(nextPeople, volunteersData));
      setMembers(membersData);
    } catch (err) {
      if (err instanceof Error && err.message === "unauthorized") {
        setIsAuthenticated(false);
        setLoginError(m.admin_login_error());
        return;
      }
      console.error("Failed to load dashboard data", err);
      setError(m.admin_error_load_data());
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, loadMembers, loadVolunteers]);

  const validateToken = useCallback(
    async (tokenToValidate: string): Promise<"valid" | "invalid" | "transientError"> => {
      try {
        const response = await fetch("/api/reservations", {
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
    setIsAuthenticated(false);
    setToken("");
    setReservations([]);
    setTables([]);
    setRooms([]);
    setTableTypes([]);
    setPeople([]);
    setMembers([]);
  }, []);

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
      setPeople((prev) =>
        prev
          .filter((p) => p.id !== duplicateId)
          .map((p) => (p.id === canonicalId ? mergedCanonical : p)),
      );
      setMembers((prev) =>
        syncMembersWithPerson(
          prev.filter((member) => member.id !== duplicateId),
          mergedCanonical,
        ),
      );
      // Re-point any reservations in state that were on the duplicate;
      // also refresh person data on any already-canonical reservations (merged fields may have changed).
      setReservations((prev) =>
        prev.map((r) =>
          r.personId === duplicateId
            ? { ...r, personId: canonicalId, person: canonicalPerson }
            : r.personId === canonicalId
              ? { ...r, person: canonicalPerson }
              : r,
        ),
      );
      // Re-point any exhibitors in state that were linked to the duplicate contact person
      setExhibitors((prev) =>
        prev.map((ex) =>
          ex.contactPersonId === duplicateId ? { ...ex, contactPersonId: canonicalId } : ex,
        ),
      );
    },
    [authHeaders, people],
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
      setMembers((prev) => [createdMember, ...prev]);
      setPeople((prev) => [createdMember, ...prev]);
    },
    [authHeaders],
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
      setMembers((prev) => prev.map((member) => (member.id === id ? updatedMember : member)));
      setPeople((prev) => replacePersonById(prev, updatedMember));
      setReservations((prev) =>
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
      setDetailReservation((prev) =>
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
    [authHeaders],
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
      setMembers((prev) => prev.filter((member) => member.id !== id));
      setPeople((prev) => prev.filter((person) => person.id !== id));
    },
    [authHeaders],
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
      setPeople((prev) => [createdPerson, ...prev]);
      setMembers((prev) => syncMembersWithPerson(prev, createdPerson));
    },
    [authHeaders],
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
      setPeople((prev) => replacePersonById(prev, updated));
      setMembers((prev) => syncMembersWithPerson(prev, updated));
      setReservations((prev) =>
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
      setDetailReservation((prev) =>
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
    [authHeaders],
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
      setPeople((prev) => prev.filter((p) => p.id !== id));
      setMembers((prev) => prev.filter((member) => member.id !== id));
    },
    [authHeaders],
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
      setPeople((prev) => [mergeVolunteerPerson(undefined, createdVolunteer), ...prev]);
    },
    [authHeaders],
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
      setPeople((prev) => replaceVolunteerById(prev, updatedVolunteer));
      setMembers((prev) =>
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
    [authHeaders],
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
      setPeople((prev) =>
        prev.map((person) =>
          person.id !== id
            ? person
            : { ...person, roles: person.roles.filter((r) => r !== "volunteer"), helpPeriods: [] },
        ),
      );
    },
    [authHeaders],
  );

  const handleExhibitorSaved = useCallback((item: ItemDraft) => {
    setExhibitors((prev) => {
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
  }, []);

  const handleExhibitorDeleted = useCallback((id: number) => {
    setExhibitors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const volunteers = useMemo(
    () => people.filter((person) => person.roles.includes("volunteer")),
    [people],
  );

  useEffect(() => {
    if (isAuthenticated && visible) {
      loadData();
    }
  }, [isAuthenticated, visible, loadData]);

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
    async (id: string, status: ReservationStatus) => {
      try {
        const response = await fetch(`/api/reservations/${id}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ status }),
        });
        if (response.ok) {
          setReservations((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r,
            ),
          );
        }
      } catch (err) {
        console.error("Failed to update reservation status", err);
        setError(m.admin_error_update_reservation());
      }
    },
    [authHeaders],
  );

  const handleUpdatePayment = useCallback(
    async (id: string, paymentStatus: PaymentStatus) => {
      try {
        const response = await fetch(`/api/reservations/${id}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ payment_status: paymentStatus }),
        });
        if (response.ok) {
          setReservations((prev) =>
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
    [authHeaders],
  );

  const handleAssignTable = useCallback(
    async (reservationId: string, tableId: string | undefined) => {
      try {
        const response = await fetch(`/api/reservations/${reservationId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ table_id: tableId ?? null }),
        });
        if (response.ok) {
          setReservations((prev) =>
            prev.map((r) =>
              r.id === reservationId ? { ...r, tableId, updatedAt: new Date().toISOString() } : r,
            ),
          );

          // Update the tables' reservationIds lists
          setTables((prevTables) =>
            prevTables.map((t) => {
              const wasAssigned = t.reservationIds.includes(reservationId);
              const shouldBeAssigned = t.id === tableId;
              if (wasAssigned && !shouldBeAssigned) {
                return {
                  ...t,
                  reservationIds: t.reservationIds.filter((id) => id !== reservationId),
                };
              }
              if (!wasAssigned && shouldBeAssigned) {
                return { ...t, reservationIds: [...t.reservationIds, reservationId] };
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
    [authHeaders],
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
      setTables((prev) => [...prev, apiTableToTable(table)]);
    },
    [authHeaders],
  );

  const handleMoveTable = useCallback(
    async (tableId: string, x: number, y: number) => {
      // Optimistic update
      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, x, y } : t)));
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
    [authHeaders],
  );

  const handleRotateTable = useCallback(
    async (tableId: string, rotation: number) => {
      // Normalise to [0, 360)
      const normalised = ((rotation % 360) + 360) % 360;
      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, rotation: normalised } : t)));
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
    [authHeaders],
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
      setTables((prev) => prev.filter((t) => t.id !== tableId));
    },
    [authHeaders],
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
      setVenues((prev) => [...prev, apiVenueToVenue(d)]);
    },
    [authHeaders],
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
      setVenues((prev) => prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)));
    },
    [authHeaders],
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
      setVenues((prev) => prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)));
    },
    [authHeaders],
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
      setVenues((prev) => prev.filter((v) => v.id !== venueId));
      // Cascade: remove rooms and their layouts/tables from local state
      const venueRoomIds = rooms.filter((r) => r.venueId === venueId).map((r) => r.id);
      setRooms((prev) => prev.filter((r) => r.venueId !== venueId));
      const venueLayoutIds = layouts
        .filter((l) => venueRoomIds.includes(l.roomId ?? ""))
        .map((l) => l.id);
      setLayouts((prev) => prev.filter((l) => !venueRoomIds.includes(l.roomId ?? "")));
      setTables((prev) => prev.filter((t) => !venueLayoutIds.includes(t.layoutId)));
    },
    [authHeaders, rooms, layouts],
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
      setRooms((prev) => [...prev, apiRoomToRoom(data)]);
    },
    [authHeaders],
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
      setRooms((prev) => prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)));
    },
    [authHeaders],
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
      setRooms((prev) => prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)));
    },
    [authHeaders],
  );

  const handleAddLayout = useCallback(
    async (roomId: string, dayId: number, label?: string) => {
      const response = await fetch("/api/layouts", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          room_id: roomId,
          day_id: dayId,
          ...(label?.trim() ? { label: label.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_add_layout());
      }
      const d = await response.json();
      setLayouts((prev) => [...prev, apiLayoutToLayout(d)]);
    },
    [authHeaders],
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
      setLayouts((prev) => prev.filter((l) => l.id !== layoutId));
      setTables((prev) => prev.filter((t) => t.layoutId !== layoutId));
      setAreas((prev) => prev.filter((a) => a.layoutId !== layoutId));
    },
    [authHeaders],
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
      setAreas((prev) => [...prev, apiAreaToArea(data)]);
    },
    [authHeaders],
  );

  const handleMoveArea = useCallback(
    async (areaId: string, x: number, y: number) => {
      const prev = areas.find((a) => a.id === areaId);
      setAreas((prevAreas) => prevAreas.map((a) => (a.id === areaId ? { ...a, x, y } : a)));
      try {
        const response = await fetch(`/api/areas/${areaId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ x, y }),
        });
        if (!response.ok) {
          if (prev)
            setAreas((prevAreas) =>
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
    [authHeaders, areas],
  );

  const handleRotateArea = useCallback(
    async (areaId: string, rotation: number) => {
      const prev = areas.find((a) => a.id === areaId);
      const normalised = ((rotation % 360) + 360) % 360;
      setAreas((prevAreas) =>
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
            setAreas((prevAreas) =>
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
    [authHeaders, areas],
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
      setAreas((prev) => prev.filter((a) => a.id !== areaId));
    },
    [authHeaders],
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
      setAreas((prev) => prev.map((a) => (a.id === areaId ? apiAreaToArea(d) : a)));
    },
    [authHeaders],
  );

  const handleUpdateAreaLabel = useCallback(
    async (areaId: string, label: string) => {
      setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, label } : a)));
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
    [authHeaders],
  );

  const handleChangeTableType = useCallback(
    async (tableId: string, tableTypeId: string) => {
      let previousTable: FloorTable | undefined;
      setTables((prev) => {
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
          setTables((prev) => prev.map((t) => (t.id === tableId ? snapshot : t)));
        }
        throw err;
      }
    },
    [authHeaders],
  );

  const handleUpdateTable = useCallback(
    async (tableId: string, name: string) => {
      let previousTable: FloorTable | undefined;
      setTables((prev) => {
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
          setTables((prev) => prev.map((t) => (t.id === tableId ? snapshot : t)));
        }
        console.error("Failed to persist table name", err);
        throw err;
      }
    },
    [authHeaders],
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
      setAreas((prev) => {
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
          setAreas((prev) => prev.map((a) => (a.id === areaId ? snapshot : a)));
        }
        console.error("Failed to persist area resize", err);
        throw err;
      }
    },
    [authHeaders, areas, layouts, rooms],
  );

  const handleAddReservation = useCallback((reservation: Reservation) => {
    setReservations((prev) => [reservation, ...prev]);
  }, []);

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
      setTableTypes((prev) => [...prev, apiTableTypeToTableType(d)]);
    },
    [authHeaders],
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
      setTableTypes((prev) => prev.map((tt) => (tt.id === id ? apiTableTypeToTableType(d) : tt)));
    },
    [authHeaders],
  );

  const handleArchiveTableType = useCallback(
    (id: string) => handleUpdateTableType(id, { active: false }),
    [handleUpdateTableType],
  );

  const handleRestoreTableType = useCallback(
    (id: string) => handleUpdateTableType(id, { active: true }),
    [handleUpdateTableType],
  );

  /** Fetch the full reservation (including checkInToken) and open detail modal */
  const handleViewDetail = useCallback(
    async (res: Reservation) => {
      try {
        const response = await fetch(`/api/reservations/${res.id}`, {
          headers: authHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          setDetailReservation(apiToReservation(data as Record<string, unknown>));
        } else {
          // Fall back to the list version (no token available)
          setDetailReservation(res);
        }
      } catch (err) {
        console.error("Failed to fetch reservation detail, falling back to list data", err);
        setDetailReservation(res);
      }
    },
    [authHeaders],
  );

  const handleToggleDelivered = useCallback(
    async (reservationId: string, updatedOrders: OrderItem[]) => {
      try {
        const response = await fetch(`/api/reservations/${reservationId}`, {
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
          setReservations((prev) =>
            prev.map((r) =>
              r.id === reservationId
                ? { ...r, preOrders: updatedOrders, updatedAt: new Date().toISOString() }
                : r,
            ),
          );
          // Also update the detail modal
          setDetailReservation((prev) =>
            prev?.id === reservationId ? { ...prev, preOrders: updatedOrders } : prev,
          );
        }
      } catch (err) {
        console.error("Failed to update bottle delivery status", err);
        setError(m.admin_error_bottle_delivery());
      }
    },
    [authHeaders],
  );

  const handleCheckIn = useCallback(
    async (reservationId: string) => {
      try {
        const response = await fetch(`/api/reservations/${reservationId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ checked_in: true }),
        });
        if (response.ok) {
          const data = await response.json();
          const updated = apiToReservation(data as Record<string, unknown>);
          setReservations((prev) =>
            prev.map((r) =>
              r.id === reservationId
                ? { ...r, checkedIn: true, checkedInAt: updated.checkedInAt }
                : r,
            ),
          );
          setDetailReservation((prev) =>
            prev?.id === reservationId
              ? { ...prev, checkedIn: true, checkedInAt: updated.checkedInAt }
              : prev,
          );
        }
      } catch (err) {
        console.error("Failed to check in guest", err);
        setError(m.admin_error_check_in());
      }
    },
    [authHeaders],
  );

  const handleIssueStrap = useCallback(
    async (reservationId: string) => {
      try {
        const response = await fetch(`/api/reservations/${reservationId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ strap_issued: true }),
        });
        if (response.ok) {
          setReservations((prev) =>
            prev.map((r) => (r.id === reservationId ? { ...r, strapIssued: true } : r)),
          );
          setDetailReservation((prev) =>
            prev?.id === reservationId ? { ...prev, strapIssued: true } : prev,
          );
        }
      } catch (err) {
        console.error("Failed to issue strap", err);
        setError(m.admin_error_issue_strap());
      }
    },
    [authHeaders],
  );

  // Computed maps derived from people/reservations state — must stay above any early return
  // to satisfy the Rules of Hooks (hooks must be called unconditionally).
  const reservationCountByPersonId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reservations) {
      if (r.personId == null) continue;
      counts[r.personId] = (counts[r.personId] ?? 0) + 1;
    }
    return Object.fromEntries(people.map((p) => [p.id, counts[p.id] ?? 0]));
  }, [people, reservations]);

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
                  disabled={isLoading}
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

            {isLoading ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="warning" role="status">
                  <span className="visually-hidden">{m.admin_loading()}</span>
                </Spinner>
              </div>
            ) : (
              <Tab.Container defaultActiveKey="reservations">
                <Nav variant="tabs" className="mb-3">
                  <Nav.Item>
                    <Nav.Link eventKey="reservations" className="text-light">
                      <i className="bi bi-calendar-check me-2" aria-hidden="true" />
                      {m.admin_reservations_tab()}
                      <span className="badge bg-warning text-dark ms-2">{reservations.length}</span>
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
                  <Tab.Pane eventKey="reservations">
                    <ReservationList
                      reservations={reservations}
                      tables={tables}
                      exhibitors={exhibitors}
                      filter={filter}
                      onFilterChange={setFilter}
                      onUpdateStatus={handleUpdateStatus}
                      onUpdatePayment={handleUpdatePayment}
                      onAssignTable={handleAssignTable}
                      onViewDetail={handleViewDetail}
                      onAddReservation={handleAddReservation}
                      authHeaders={authHeaders}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="tables">
                    <LayoutEditor
                      tables={tables}
                      tableTypes={tableTypes}
                      layouts={layouts}
                      reservations={reservations}
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
                      reservationCountByPersonId={reservationCountByPersonId}
                      isLoading={isLoading}
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
                      reservationCountByPersonId={reservationCountByPersonId}
                      isLoading={isLoading}
                      onCreate={handleCreateMember}
                      onUpdate={handleUpdateMember}
                      onDelete={handleDeleteMember}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="volunteers">
                    <VolunteersManagement
                      volunteers={volunteers}
                      isLoading={isLoading}
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

        {/* Reservation detail modal (with QR code + bottle delivery) */}
        {detailReservation && (
          <ReservationDetail
            reservation={detailReservation}
            baseUrl={window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "")}
            emailDuplicates={(() => {
              const personEmail = detailReservation.person.email.toLowerCase();
              return people
                .filter(
                  (p) =>
                    p.id !== detailReservation.personId &&
                    p.email &&
                    p.email.toLowerCase() === personEmail,
                )
                .map((p) => ({ id: p.id, name: p.name }));
            })()}
            onClose={() => setDetailReservation(null)}
            onToggleDelivered={handleToggleDelivered}
            onCheckIn={handleCheckIn}
            onIssueStrap={handleIssueStrap}
            onMergeDuplicate={async (canonicalId, duplicateId) => {
              try {
                await handleMergePeople(canonicalId, duplicateId);
                setDetailReservation(null);
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

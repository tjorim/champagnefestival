import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import PeopleManagement from "./PeopleManagement";
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

export default function AdminDashboard({ visible }: AdminDashboardProps) {
  const [token, setToken] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
  const [filter, setFilter] = useState<"all" | ReservationStatus>("all");
  /** Full reservation (with checkInToken) shown in the detail modal */
  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null);

  const authHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

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
        setReservations([]);
        setTables([]);
        setVenues([]);
        setRooms([]);
        setTableTypes([]);
        setLayouts([]);
        setExhibitors([]);
        setAreas([]);
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
      setPeople(Array.isArray(peopleData) ? peopleData.map(apiToPerson) : []);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
      setError(m.admin_error_load_data());
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!token.trim()) return;
      setIsLoggingIn(true);
      setLoginError("");

      try {
        const response = await fetch("/api/reservations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          // loadData() will be triggered by the useEffect watching isAuthenticated
          setIsAuthenticated(true);
        } else {
          setLoginError(m.admin_login_error());
        }
      } catch (err) {
        console.error("Login request failed", err);
        setLoginError(m.admin_login_error());
      } finally {
        setIsLoggingIn(false);
      }
    },
    [token],
  );

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
    setToken("");
    setReservations([]);
    setTables([]);
    setRooms([]);
    setTableTypes([]);
    setPeople([]);
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
      // Replace both the canonical and duplicate in the people list
      setPeople((prev) =>
        prev
          .filter((p) => p.id !== duplicateId)
          .map((p) => (p.id === canonicalId ? canonicalPerson : p)),
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
    [authHeaders],
  );

  useEffect(() => {
    if (isAuthenticated && visible) {
      loadData();
    }
  }, [isAuthenticated, visible, loadData]);

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
    async (roomId: string, dayId: number, label: string) => {
      const response = await fetch("/api/layouts", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId, day_id: dayId, label }),
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
                    <ContentManagement authHeaders={authHeaders} venues={venues} />
                  </Tab.Pane>
                  <Tab.Pane eventKey="people">
                    <PeopleManagement
                      people={people}
                      reservationCountByPersonId={reservationCountByPersonId}
                      isLoading={isLoading}
                      onMerge={handleMergePeople}
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
              await handleMergePeople(canonicalId, duplicateId);
              setDetailReservation(null);
            }}
          />
        )}
      </Container>
    </section>
  );
}

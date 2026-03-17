import React, { useState, useEffect, useCallback } from "react";
import Container from "react-bootstrap/Container";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Tab from "react-bootstrap/Tab";
import Nav from "react-bootstrap/Nav";
import Spinner from "react-bootstrap/Spinner";
import { m } from "../../paraglide/messages";
import ReservationList from "./ReservationList";
import ReservationDetail from "./ReservationDetail";
import LayoutEditor from "./LayoutEditor";
import TableTypeManagement from "./TableTypeManagement";
import VenueManagement from "./VenueManagement";
import ContentManagement from "./ContentManagement";
import type {
  Reservation,
  ReservationStatus,
  PaymentStatus,
  OrderItem,
  OrderItemCategory,
} from "../../types/reservation";
import type { Room, FloorTable, TableType, Layout, Venue } from "../../types/admin";

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
    postalCode: (d.postal_code ?? d.postalCode ?? "") as string,
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
    editionId: ((d.edition_id ?? d.editionId) as string | null) ?? null,
    roomId: (d.room_id ?? d.roomId) as string,
    dayId: (d.day_id ?? d.dayId) as number,
    label: (d.label ?? "") as string,
    createdAt: (d.created_at ?? d.createdAt) as string,
  };
}

/** Map FastAPI snake_case table type response to frontend camelCase TableType type */
function apiTableTypeToTableType(d: Record<string, unknown>): TableType {
  return {
    id: d.id as string,
    name: d.name as string,
    shape: (d.shape ?? "rectangle") as "rectangle" | "round",
    widthM: (d.width_m ?? d.widthM ?? 1.8) as number,
    lengthM: (d.length_m ?? d.lengthM ?? 0.7) as number,
    heightType: (d.height_type ?? d.heightType ?? "low") as "low" | "high",
    maxCapacity: (d.max_capacity ?? d.maxCapacity ?? 4) as number,
  };
}

/** Map FastAPI snake_case room response to frontend camelCase Room type */
function apiRoomToRoom(d: Record<string, unknown>): Room {
  return {
    id: d.id as string,
    venueId: (d.venue_id ?? d.venueId) as string,
    name: d.name as string,
    widthM: (d.width_m ?? d.widthM) as number,
    lengthM: (d.length_m ?? d.lengthM) as number,
    color: d.color as string,
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
    tableTypeId: (d.table_type_id ?? d.tableTypeId) as string,
    rotation: (d.rotation ?? 0) as number,
    layoutId: (d.layout_id ?? d.layoutId) as string,
    reservationIds: ((d.reservation_ids ?? d.reservationIds) as string[]) ?? [],
  };
}

/** Map FastAPI snake_case reservation response to frontend camelCase Reservation type */
function apiReservationToReservation(d: Record<string, unknown>): Reservation {
  const rawOrders = (d.pre_orders ?? d.preOrders ?? []) as Record<string, unknown>[];
  return {
    id: d.id as string,
    name: d.name as string,
    email: (d.email ?? "") as string,
    phone: (d.phone ?? "") as string,
    eventId: (d.event_id ?? d.eventId) as string,
    eventTitle: (d.event_title ?? d.eventTitle ?? "") as string,
    guestCount: (d.guest_count ?? d.guestCount) as number,
    preOrders: rawOrders.map((item) => ({
      productId: (item.product_id ?? item.productId) as string,
      name: item.name as string,
      quantity: item.quantity as number,
      price: item.price as number,
      category: (item.category ?? "other") as OrderItemCategory,
      delivered: (item.delivered ?? false) as boolean,
    })),
    notes: (d.notes ?? "") as string,
    tableId: (d.table_id ?? d.tableId) as string | undefined,
    status: (d.status ?? "pending") as ReservationStatus,
    paymentStatus: (d.payment_status ?? d.paymentStatus ?? "unpaid") as PaymentStatus,
    checkedIn: (d.checked_in ?? d.checkedIn ?? false) as boolean,
    checkedInAt: (d.checked_in_at ?? d.checkedInAt) as string | undefined,
    strapIssued: (d.strap_issued ?? d.strapIssued ?? false) as boolean,
    checkInToken: (d.check_in_token ?? d.checkInToken) as string | undefined,
    createdAt: (d.created_at ?? d.createdAt) as string,
    updatedAt: (d.updated_at ?? d.updatedAt) as string,
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
      ] = await Promise.all([
        fetch("/api/reservations", { headers: authHeaders() }),
        fetch("/api/tables", { headers: authHeaders() }),
        fetch("/api/venues", { headers: authHeaders() }),
        fetch("/api/rooms", { headers: authHeaders() }),
        fetch("/api/table-types", { headers: authHeaders() }),
        fetch("/api/layouts", { headers: authHeaders() }),
      ]);

      const responses = [
        resResponse,
        tablesResponse,
        venuesResponse,
        roomsResponse,
        tableTypesResponse,
        layoutsResponse,
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
        setError(m.admin_error_load_data());
        return;
      }

      const data = await resResponse.json();
      const rawRes: Record<string, unknown>[] = Array.isArray(data) ? data : [];
      setReservations(rawRes.map(apiReservationToReservation));

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
  }, []);

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

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? m.admin_error_delete_room());
      }
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      const roomLayoutIds = layouts.filter((l) => l.roomId === roomId).map((l) => l.id);
      setLayouts((prev) => prev.filter((l) => l.roomId !== roomId));
      setTables((prev) => prev.filter((t) => !roomLayoutIds.includes(t.layoutId)));
    },
    [authHeaders, layouts],
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
    },
    [authHeaders],
  );

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

  const handleDeleteTableType = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/table-types/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? m.admin_error_delete_table_type());
      }
      setTableTypes((prev) => prev.filter((tt) => tt.id !== id));
    },
    [authHeaders],
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
          setDetailReservation(apiReservationToReservation(data as Record<string, unknown>));
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
          const updated = apiReservationToReservation(data as Record<string, unknown>);
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
                      {m.admin_venue_add()}
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
                </Nav>
                <Tab.Content>
                  <Tab.Pane eventKey="reservations">
                    <ReservationList
                      reservations={reservations}
                      tables={tables}
                      filter={filter}
                      onFilterChange={setFilter}
                      onUpdateStatus={handleUpdateStatus}
                      onUpdatePayment={handleUpdatePayment}
                      onAssignTable={handleAssignTable}
                      onViewDetail={handleViewDetail}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="tables">
                    <LayoutEditor
                      tables={tables}
                      tableTypes={tableTypes}
                      layouts={layouts}
                      reservations={reservations}
                      rooms={rooms}
                      onAddTable={handleAddTable}
                      onMoveTable={handleMoveTable}
                      onDeleteTable={handleDeleteTable}
                      onRotateTable={handleRotateTable}
                      onAddLayout={handleAddLayout}
                      onDeleteLayout={handleDeleteLayout}
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
                      onDeleteRoom={handleDeleteRoom}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="table-types">
                    <TableTypeManagement
                      tableTypes={tableTypes}
                      onAdd={handleAddTableType}
                      onUpdate={handleUpdateTableType}
                      onDelete={handleDeleteTableType}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="content">
                    <ContentManagement authHeaders={authHeaders} venues={venues} />
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
            onClose={() => setDetailReservation(null)}
            onToggleDelivered={handleToggleDelivered}
            onCheckIn={handleCheckIn}
            onIssueStrap={handleIssueStrap}
          />
        )}
      </Container>
    </section>
  );
}

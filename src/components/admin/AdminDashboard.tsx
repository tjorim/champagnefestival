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
import TableLayout from "./TableLayout";
import ContentManagement from "./ContentManagement";
import type {
  Reservation,
  Room,
  Table,
  ReservationStatus,
  PaymentStatus,
  OrderItem,
  OrderItemCategory,
} from "../../types/reservation";

interface AdminDashboardProps {
  visible: boolean;
}

/** Map FastAPI snake_case room response to frontend camelCase Room type */
function apiRoomToRoom(d: Record<string, unknown>): Room {
  return {
    id: d.id as string,
    name: d.name as string,
    zoneType: (d.zone_type ?? d.zoneType) as string,
    widthM: (d.width_m ?? d.widthM) as number,
    heightM: (d.height_m ?? d.heightM) as number,
    color: d.color as string,
  };
}

/** Map FastAPI snake_case table response to frontend camelCase Table type */
function apiTableToTable(d: Record<string, unknown>): Table {
  return {
    id: d.id as string,
    name: d.name as string,
    capacity: d.capacity as number,
    x: d.x as number,
    y: d.y as number,
    roomId: ((d.room_id ?? d.roomId) as string | null) ?? null,
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
  const [tables, setTables] = useState<Table[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
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
      const [resResponse, tablesResponse, roomsResponse] = await Promise.all([
        fetch("/api/reservations", { headers: authHeaders() }),
        fetch("/api/tables", { headers: authHeaders() }),
        fetch("/api/rooms", { headers: authHeaders() }),
      ]);

      if (resResponse.status === 401 || tablesResponse.status === 401) {
        setIsAuthenticated(false);
        setLoginError(m.admin_login_error());
        return;
      }

      if (resResponse.ok) {
        const data = await resResponse.json();
        const rawRes: Record<string, unknown>[] = Array.isArray(data) ? data : [];
        setReservations(rawRes.map(apiReservationToReservation));
      }
      if (tablesResponse.ok) {
        const data = await tablesResponse.json();
        const raw: Record<string, unknown>[] = Array.isArray(data) ? data : (data.tables ?? []);
        setTables(raw.map(apiTableToTable));
      }
      if (roomsResponse.ok) {
        const data = await roomsResponse.json();
        setRooms(Array.isArray(data) ? data.map(apiRoomToRoom) : []);
      }
    } catch {
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
        if (response.ok || response.status === 200) {
          setIsAuthenticated(true);
          const data = await response.json();
          const rawRes: Record<string, unknown>[] = Array.isArray(data) ? data : [];
          setReservations(rawRes.map(apiReservationToReservation));
        } else {
          setLoginError(m.admin_login_error());
        }
      } catch {
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
      } catch {
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
              r.id === id
                ? { ...r, paymentStatus, updatedAt: new Date().toISOString() }
                : r,
            ),
          );
        }
      } catch {
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
              r.id === reservationId
                ? { ...r, tableId, updatedAt: new Date().toISOString() }
                : r,
            ),
          );

          // Update the tables' reservationIds lists
          setTables((prevTables) =>
            prevTables.map((t) => {
              const wasAssigned = t.reservationIds.includes(reservationId);
              const shouldBeAssigned = t.id === tableId;
              if (wasAssigned && !shouldBeAssigned) {
                return { ...t, reservationIds: t.reservationIds.filter((id) => id !== reservationId) };
              }
              if (!wasAssigned && shouldBeAssigned) {
                return { ...t, reservationIds: [...t.reservationIds, reservationId] };
              }
              return t;
            }),
          );
        }
      } catch {
        setError(m.admin_error_assign_table());
      }
    },
    [authHeaders],
  );

  const handleAddTable = useCallback(
    async (name: string, capacity: number, roomId: string | null) => {
      try {
        const response = await fetch("/api/tables", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name, capacity, x: 10, y: 10, room_id: roomId }),
        });
        if (response.ok) {
          const data = await response.json();
          const table = data.table ?? data;
          setTables((prev) => [...prev, apiTableToTable(table)]);
        }
      } catch {
        setError(m.admin_error_add_table());
      }
    },
    [authHeaders],
  );

  const handleMoveTable = useCallback(
    async (tableId: string, x: number, y: number) => {
      // Optimistic update
      setTables((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, x, y } : t)),
      );
      try {
        await fetch(`/api/tables/${tableId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ x, y }),
        });
      } catch {
        // Non-critical: position will persist until next reload
      }
    },
    [authHeaders],
  );

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      try {
        const response = await fetch(`/api/tables/${tableId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (response.ok) {
          setTables((prev) => prev.filter((t) => t.id !== tableId));
        }
      } catch {
        setError(m.admin_error_delete_table());
      }
    },
    [authHeaders],
  );

  const handleAddRoom = useCallback(
    async (name: string, zoneType: string, widthM: number, heightM: number, color: string) => {
      try {
        const response = await fetch("/api/rooms", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name, zone_type: zoneType, width_m: widthM, height_m: heightM, color }),
        });
        if (response.ok) {
          const data = await response.json();
          setRooms((prev) => [...prev, apiRoomToRoom(data)]);
        }
      } catch {
        setError(m.admin_error_add_room());
      }
    },
    [authHeaders],
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      try {
        const response = await fetch(`/api/rooms/${roomId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (response.ok || response.status === 204) {
          setRooms((prev) => prev.filter((r) => r.id !== roomId));
          // Clear room assignment from tables that were in this room
          setTables((prev) =>
            prev.map((t) => (t.roomId === roomId ? { ...t, roomId: null } : t)),
          );
        }
      } catch {
        setError(m.admin_error_delete_room());
      }
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
      } catch {
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
      } catch {
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
            prev.map((r) => (r.id === reservationId ? { ...r, checkedIn: true, checkedInAt: updated.checkedInAt } : r)),
          );
          setDetailReservation((prev) =>
            prev?.id === reservationId ? { ...prev, checkedIn: true, checkedInAt: updated.checkedInAt } : prev,
          );
        }
      } catch {
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
      } catch {
        setError(m.admin_error_check_in());
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
                    {loginError && <Alert variant="danger" className="py-2">{loginError}</Alert>}
                    <Button
                      type="submit"
                      variant="warning"
                      className="w-100"
                      disabled={isLoggingIn || !token.trim()}
                    >
                      {isLoggingIn ? (
                        <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
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
                <Button variant="outline-secondary" size="sm" onClick={loadData} disabled={isLoading}>
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
                    <TableLayout
                      tables={tables}
                      reservations={reservations}
                      rooms={rooms}
                      onAddTable={handleAddTable}
                      onMoveTable={handleMoveTable}
                      onDeleteTable={handleDeleteTable}
                      onAddRoom={handleAddRoom}
                      onDeleteRoom={handleDeleteRoom}
                    />
                  </Tab.Pane>
                  <Tab.Pane eventKey="content">
                    <ContentManagement authHeaders={authHeaders} />
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

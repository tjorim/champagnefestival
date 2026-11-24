import { jsonResponse } from "../../response";
import type { RoomOut, TableOut, TableTypeOut } from "@/api-types";
import { http, HttpResponse } from "msw/http";
import { sharedStore } from "../../data/registrations";
import { venues, rooms, tableTypes, tables, layouts, uid, now } from "./state";
import { requireAuth } from "./auth";

function tablesWithRegistrationAssignments(): import("@/api-types").TableOut[] {
  const byTableId = new Map<string, string[]>();

  for (const registration of sharedStore.registrations) {
    if (registration.status === "cancelled") continue;
    const allocations = (registration.allocations ?? []) as { table_id: string }[];
    for (const allocation of allocations) {
      const ids = byTableId.get(allocation.table_id) ?? [];
      ids.push(String(registration.id));
      byTableId.set(allocation.table_id, ids);
    }
  }

  return tables.map((table) => {
    const tableId = table.id;
    const registrationIds =
      typeof tableId === "string" && tableId.length > 0 ? (byTableId.get(tableId) ?? []) : [];
    return {
      ...table,
      event_id: layouts.find((l) => l.id === table.layout_id)?.event_id ?? "",
      registration_ids: registrationIds,
    };
  });
}

export const venueHandlers = [
  // ──────────────────────────────────────────────────────────────
  // Venues
  // ──────────────────────────────────────────────────────────────
  http.get("/api/venues", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return jsonResponse<import("@/api-types").VenueOut[]>(venues);
  }),

  http.post("/api/venues", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newVenue = {
      id: uid(),
      name: String(body.name ?? ""),
      address: String(body.address ?? ""),
      city: String(body.city ?? ""),
      postal_code: String(body.postal_code ?? ""),
      country: String(body.country ?? "Belgium"),
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      active: body.active !== false,
      created_at: now(),
      updated_at: now(),
    };
    venues.push(newVenue);
    return jsonResponse<import("@/api-types").VenueOut>(newVenue, { status: 201 });
  }),

  http.put("/api/venues/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = venues.findIndex((v) => v.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    venues[idx] = { ...venues[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").VenueOut>(venues[idx]);
  }),

  http.delete("/api/venues/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = venues.findIndex((v) => v.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    venues.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Rooms
  // ──────────────────────────────────────────────────────────────
  http.get("/api/rooms", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return jsonResponse<import("@/api-types").RoomOut[]>(rooms);
  }),

  http.post("/api/rooms", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newRoom: RoomOut = {
      id: uid(),
      venue_id: String(body.venue_id ?? ""),
      name: String(body.name ?? ""),
      width_m: Number(body.width_m ?? 10),
      length_m: Number(body.length_m ?? 10),
      color: String(body.color ?? "#4a90d9"),
      active: body.active !== false,
      dimensions_placeholder: false,
      created_at: now(),
      updated_at: now(),
    };
    rooms.push(newRoom);
    return jsonResponse<import("@/api-types").RoomOut>(newRoom, { status: 201 });
  }),

  http.put("/api/rooms/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = rooms.findIndex((r) => r.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    rooms[idx] = { ...rooms[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").RoomOut>(rooms[idx]);
  }),

  http.delete("/api/rooms/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = rooms.findIndex((r) => r.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    rooms.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Table Types
  // ──────────────────────────────────────────────────────────────
  http.get("/api/table-types", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return jsonResponse<import("@/api-types").TableTypeOut[]>(tableTypes);
  }),

  http.post("/api/table-types", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.venue_id) {
      return HttpResponse.json({ detail: "venue_id is required." }, { status: 400 });
    }
    const newTT: TableTypeOut = {
      id: uid(),
      name: String(body.name ?? ""),
      venue_id: String(body.venue_id),
      shape: body.shape === "rectangle" ? "rectangle" : "round",
      width_m: Number(body.width_m ?? 1),
      length_m: Number(body.length_m ?? 1),
      height_type: body.height_type === "low" ? "low" : "high",
      capacity: Number(body.capacity ?? 4),
      active: body.active !== false,
      created_at: now(),
      updated_at: now(),
    };
    tableTypes.push(newTT);
    return jsonResponse<import("@/api-types").TableTypeOut>(newTT, { status: 201 });
  }),

  http.put("/api/table-types/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tableTypes.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    tableTypes[idx] = { ...tableTypes[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").TableTypeOut>(tableTypes[idx]);
  }),

  http.delete("/api/table-types/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tableTypes.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    tableTypes.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Tables
  // ──────────────────────────────────────────────────────────────
  http.get("/api/tables", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return jsonResponse<import("@/api-types").TableOut[]>(tablesWithRegistrationAssignments());
  }),

  http.get("/api/tables/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const table = tablesWithRegistrationAssignments().find((t) => t.id === params.id);
    if (!table) return HttpResponse.json(null, { status: 404 });
    return jsonResponse<import("@/api-types").TableOut>(table);
  }),

  http.post("/api/tables", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const tableTypeId = String(body.table_type_id ?? "");
    const tableType = tableTypes.find((candidate) => candidate.id === tableTypeId);
    const layoutId = String(body.layout_id ?? "");
    const newTable: TableOut = {
      id: uid(),
      event_id: layouts.find((layout) => layout.id === layoutId)?.event_id ?? "",
      name: String(body.name ?? ""),
      capacity: Number(tableType?.capacity ?? 4),
      x: Number(body.x ?? 50),
      y: Number(body.y ?? 50),
      table_type_id: tableTypeId,
      rotation: Number(body.rotation ?? 0),
      layout_id: layoutId,
      registration_ids: [],
      created_at: now(),
      updated_at: now(),
    };
    tables.push(newTable);
    return jsonResponse<import("@/api-types").TableOut>(newTable, { status: 201 });
  }),

  http.put("/api/tables/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tables.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    tables[idx] = { ...tables[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").TableOut>(tables[idx]);
  }),

  http.patch("/api/tables/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tables.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    tables[idx] = { ...tables[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").TableOut>(tables[idx]!);
  }),

  http.delete("/api/tables/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tables.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    tables.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

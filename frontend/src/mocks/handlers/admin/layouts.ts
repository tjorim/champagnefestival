import { jsonResponse } from "../../response";
import type { LayoutOut } from "@/api-types";
import { http, HttpResponse } from "msw/http";
import { editions, events } from "../../data/editionStore";
import {
  organizations,
  rooms,
  tables,
  layouts,
  areas,
  uid,
  now,
  setTables,
  setAreas,
} from "./state";
import { requireAuth } from "./auth";

export const layoutHandlers = [
  // ──────────────────────────────────────────────────────────────
  // Layouts
  // ──────────────────────────────────────────────────────────────
  /**
   * GET /api/editions/:editionId/stands — public stand list: areas that name an
   * organization (any type), with label, room and day (no tables or registrations).
   * Unlike the real API it ignores the festival-time publication window so the
   * seeded stands stay visible in development.
   */
  http.get("/api/editions/:editionId/stands", ({ params }) => {
    const edition = editions.find((candidate) => candidate.id === params.editionId);
    if (!edition?.active)
      return HttpResponse.json({ detail: "Edition not found." }, { status: 404 });
    const stands = new Map<number, import("@/api-types").StandOut[]>();
    for (const layout of layouts.filter((candidate) => candidate.edition_id === edition.id)) {
      if (!layout.date) continue;
      const room = rooms.find((candidate) => candidate.id === layout.room_id);
      for (const area of areas.filter((candidate) => candidate.layout_id === layout.id)) {
        const organizationId = Number(area.organization_id);
        if (!area.organization_id || !organizations.some((item) => item.id === organizationId))
          continue;
        stands.set(organizationId, [
          ...(stands.get(organizationId) ?? []),
          {
            event_id: layout.event_id,
            date: layout.date,
            room_name: room?.name ?? "",
            label: area.label,
          },
        ]);
      }
    }
    return jsonResponse<import("@/api-types").EditionStandsOut>({
      edition_id: edition.id,
      organizations: [...stands.entries()].map(([organizationId, organizationStands]) => ({
        organization_id: organizationId,
        name: organizations.find((item) => item.id === organizationId)?.name ?? "",
        stands: organizationStands,
      })),
    });
  }),

  /**
   * GET /api/editions/:editionId/plan — public floor plan: per day and room only the
   * room geometry and its areas (no tables or registrations). Like the stands handler
   * it ignores the festival-time publication window so seeded data stays visible.
   */
  http.get("/api/editions/:editionId/plan", ({ params }) => {
    const edition = editions.find((candidate) => candidate.id === params.editionId);
    if (!edition?.active)
      return HttpResponse.json({ detail: "Edition not found." }, { status: 404 });
    type PlanDay = import("@/api-types").PlanDayOut;
    const days = new Map<string, PlanDay>();
    for (const layout of layouts.filter((candidate) => candidate.edition_id === edition.id)) {
      const room = rooms.find((candidate) => candidate.id === layout.room_id);
      const layoutAreas = areas.filter((candidate) => candidate.layout_id === layout.id);
      if (!room || !layout.date || layoutAreas.length === 0) continue;
      const eventId = String(layout.event_id);
      const day: PlanDay = days.get(eventId) ?? {
        event_id: eventId,
        date: layout.date,
        rooms: [],
      };
      day.rooms.push({
        id: room.id,
        name: room.name,
        width_m: room.width_m,
        length_m: room.length_m,
        color: room.color,
        areas: layoutAreas.map((area) => ({
          id: area.id,
          label: area.label,
          icon: area.icon,
          x: area.x,
          y: area.y,
          rotation: area.rotation,
          width_m: area.width_m,
          length_m: area.length_m,
          organization_id: area.organization_id ?? null,
        })),
      });
      days.set(eventId, day);
    }
    return jsonResponse<import("@/api-types").EditionPlanOut>({
      edition_id: edition.id,
      days: [...days.values()],
    });
  }),

  /** GET /api/venue-plan/:editionId — read-only plan assembled from the layout stores. */
  http.get("/api/venue-plan/:editionId", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const editionLayouts = layouts.filter((layout) => layout.edition_id === params.editionId);
    return jsonResponse<import("@/api-types").VenuePlanOut>({
      edition_id: String(params.editionId),
      layouts: editionLayouts.map((layout) => {
        const room = rooms.find((candidate) => candidate.id === layout.room_id);
        const event = events.find((candidate) => candidate.id === layout.event_id);
        return {
          event_id: layout.event_id,
          event_title: event?.title ?? "",
          id: layout.id,
          date: layout.date ?? null,
          label: layout.label,
          room: room
            ? {
                id: room.id,
                name: room.name,
                width_m: room.width_m,
                length_m: room.length_m,
                color: room.color,
              }
            : null,
          tables: tables
            .filter((table) => table.layout_id === layout.id)
            .map((table) => ({
              id: table.id,
              name: table.name,
              exclusive: false,
              table_type_id: table.table_type_id,
              capacity: table.capacity,
              x: table.x,
              y: table.y,
              rotation: table.rotation,
              registration_ids: table.registration_ids,
              occupied_seats: (table.registration_ids as string[]).length,
            })),
          areas: areas
            .filter((area) => area.layout_id === layout.id)
            .map((area) => ({
              id: area.id,
              label: area.label,
              icon: area.icon,
              width_m: area.width_m,
              length_m: area.length_m,
              organization_id: area.organization_id,
              x: area.x,
              y: area.y,
              rotation: area.rotation,
            })),
        };
      }),
    });
  }),

  http.get("/api/layouts", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return jsonResponse<import("@/api-types").LayoutOut[]>(layouts);
  }),

  http.post("/api/layouts", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newLayout: LayoutOut = {
      id: uid(),
      edition_id: events.find((e) => e.id === body.event_id)?.edition_id ?? null,
      room_id: String(body.room_id ?? ""),
      event_id: String(body.event_id),
      event_title: events.find((e) => e.id === body.event_id)?.title ?? "",
      date: events.find((e) => e.id === body.event_id)?.date ?? null,
      label: String(body.label ?? ""),
      created_at: now(),
      updated_at: now(),
    };
    layouts.push(newLayout);
    return jsonResponse<import("@/api-types").LayoutOut>(newLayout, { status: 201 });
  }),

  http.put("/api/layouts/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = layouts.findIndex((l) => l.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    layouts[idx] = { ...layouts[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").LayoutOut>(layouts[idx]!);
  }),

  http.delete("/api/layouts/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = layouts.findIndex((l) => l.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    layouts.splice(idx, 1);
    // The real API removes the layout's tables and areas with it.
    setTables(tables.filter((table) => table.layout_id !== params.id));
    setAreas(areas.filter((area) => area.layout_id !== params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Areas
  // ──────────────────────────────────────────────────────────────
  http.get("/api/areas", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return jsonResponse<import("@/api-types").AreaOut[]>(areas);
  }),

  http.post("/api/areas", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newArea = {
      id: uid(),
      layout_id: String(body.layout_id ?? ""),
      icon: String(body.icon ?? "bi-person-standing"),
      organization_id: typeof body.organization_id === "number" ? body.organization_id : null,
      label: String(body.label ?? ""),
      x: Number(body.x ?? 50),
      y: Number(body.y ?? 50),
      rotation: Number(body.rotation ?? 0),
      width_m: Number(body.width_m ?? 2),
      length_m: Number(body.length_m ?? 2),
      created_at: now(),
      updated_at: now(),
    };
    areas.push(newArea);
    return jsonResponse<import("@/api-types").AreaOut>(newArea, { status: 201 });
  }),

  http.put("/api/areas/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = areas.findIndex((a) => a.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    areas[idx] = { ...areas[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").AreaOut>(areas[idx]);
  }),

  http.patch("/api/areas/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = areas.findIndex((a) => a.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    areas[idx] = { ...areas[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").AreaOut>(areas[idx]!);
  }),

  http.delete("/api/areas/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = areas.findIndex((a) => a.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    areas.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

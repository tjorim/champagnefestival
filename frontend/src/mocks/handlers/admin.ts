import { http, HttpResponse } from "msw";
import { editions, events, resetEditionStore, type SeedEdition, type SeedEvent } from "../data/editionStore";
import { seedExhibitors } from "../data/exhibitors";
import { seedPeople } from "../data/people";
import { sharedStore, resetSharedStore } from "../data/registrations";
import {
  seedAreas,
  seedLayouts,
  seedRooms,
  seedTableTypes,
  seedTables,
  seedVenues,
} from "../data/venue";

/** The fixed development token accepted by all admin endpoints. */
const DEV_TOKEN = "dev-token";

/** Mutable in-memory stores — reset on page reload. */
let people: Record<string, unknown>[] = structuredClone(seedPeople);
let exhibitors: Record<string, unknown>[] = structuredClone(seedExhibitors);
let venues: Record<string, unknown>[] = structuredClone(seedVenues);
let rooms: Record<string, unknown>[] = structuredClone(seedRooms);
let tableTypes: Record<string, unknown>[] = structuredClone(seedTableTypes);
let tables: Record<string, unknown>[] = structuredClone(seedTables);
let layouts: Record<string, unknown>[] = structuredClone(seedLayouts);
let areas: Record<string, unknown>[] = structuredClone(seedAreas);

function getAuth(request: Request): string | null {
  const auth = request.headers.get("Authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(auth);
  return match ? (match[1] ?? null) : null;
}

function requireAuth(request: Request): HttpResponse<null> | null {
  const token = getAuth(request);
  if (token !== DEV_TOKEN) {
    return HttpResponse.json(null, { status: 401 });
  }
  return null;
}

function uid(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function now(): string {
  return new Date().toISOString();
}

export const adminHandlers = [
  // ──────────────────────────────────────────────────────────────
  // Auth validation: GET /api/registrations returns 200 or 401
  // ──────────────────────────────────────────────────────────────
  http.get("/api/registrations", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(sharedStore.registrations);
  }),

  // ──────────────────────────────────────────────────────────────
  // Registration detail / update
  // ──────────────────────────────────────────────────────────────
  http.get("/api/registrations/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const reg = sharedStore.registrations.find((r) => r.id === params.id);
    if (!reg) return HttpResponse.json(null, { status: 404 });
    return HttpResponse.json(reg);
  }),

  http.put("/api/registrations/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = sharedStore.registrations.findIndex((r) => r.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    sharedStore.registrations[idx] = {
      ...sharedStore.registrations[idx]!,
      ...body,
      updated_at: now(),
    };
    return HttpResponse.json(sharedStore.registrations[idx]);
  }),

  http.delete("/api/registrations/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = sharedStore.registrations.findIndex((r) => r.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    sharedStore.registrations.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Admin registration creation
  // ──────────────────────────────────────────────────────────────
  http.post("/api/registrations/admin", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const person = people.find((p) => p.id === body.person_id);
    const event = events.find((e) => e.id === body.event_id);
    const newReg = {
      id: uid(),
      person_id: String(body.person_id ?? ""),
      person: person
        ? {
            id: String(person.id ?? ""),
            name: String(person.name ?? ""),
            email: String(person.email ?? ""),
            phone: String(person.phone ?? ""),
          }
        : { id: "", name: "", email: "", phone: "" },
      event_id: String(body.event_id ?? ""),
      event: event ?? null,
      guest_count: Number(body.guest_count ?? 1),
      pre_orders: [],
      notes: String(body.notes ?? ""),
      accessibility_note: "",
      table_id: null,
      status: "pending",
      payment_status: "unpaid",
      checked_in: false,
      checked_in_at: null,
      strap_issued: false,
      check_in_token: `mock-token-${uid()}`,
      created_at: now(),
      updated_at: now(),
    };
    sharedStore.registrations.push(newReg);
    return HttpResponse.json(newReg, { status: 201 });
  }),

  // ──────────────────────────────────────────────────────────────
  // People
  // ──────────────────────────────────────────────────────────────
  http.get("/api/people", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    const activeOnly = url.searchParams.get("active") === "true";

    let result = [...people];
    if (activeOnly) result = result.filter((p) => p.active);
    if (q) {
      const lq = q.toLowerCase();
      result = result.filter(
        (p) =>
          String(p.name ?? "")
            .toLowerCase()
            .includes(lq) ||
          String(p.email ?? "")
            .toLowerCase()
            .includes(lq) ||
          String(p.phone ?? "").includes(lq),
      );
    }
    return HttpResponse.json(result);
  }),

  http.post("/api/people", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newPerson = {
      id: uid(),
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      roles: Array.isArray(body.roles) ? (body.roles as string[]) : [],
      national_register_number: null,
      eid_document_number: null,
      visits_per_month: null,
      club_name: String(body.club_name ?? ""),
      notes: String(body.notes ?? ""),
      active: body.active !== false,
      created_at: now(),
      updated_at: now(),
    };
    people.push(newPerson);
    return HttpResponse.json(newPerson, { status: 201 });
  }),

  http.put("/api/people/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    people[idx] = { ...people[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(people[idx]);
  }),

  http.delete("/api/people/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    people.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/people/:id/merge/:duplicateId", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const canonical = people.find((p) => p.id === params.id);
    if (!canonical) return HttpResponse.json(null, { status: 404 });
    sharedStore.registrations = sharedStore.registrations.map((r) =>
      r.person_id === params.duplicateId ? { ...r, person_id: String(canonical.id) } : r,
    );
    people = people.filter((p) => p.id !== params.duplicateId);
    return HttpResponse.json(canonical);
  }),

  http.get("/api/people/:id/registrations", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const personRegs = sharedStore.registrations
      .filter((r) => r.person_id === params.id)
      .map((r) => ({
        id: r.id,
        event_title: (r.event as Record<string, unknown> | null)?.title ?? "",
        guest_count: r.guest_count,
        status: r.status,
        payment_status: r.payment_status,
        checked_in: r.checked_in,
        created_at: r.created_at,
      }));
    return HttpResponse.json(personRegs);
  }),

  // ──────────────────────────────────────────────────────────────
  // Members — derived from the people store (role: "member")
  // ──────────────────────────────────────────────────────────────
  http.get("/api/members", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(people.filter((p) => (p.roles as string[]).includes("member")));
  }),

  http.post("/api/members", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newMember = {
      id: uid(),
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      roles: ["member"],
      national_register_number: null,
      eid_document_number: null,
      visits_per_month: typeof body.visits_per_month === "number" ? body.visits_per_month : null,
      club_name: String(body.club_name ?? ""),
      notes: String(body.notes ?? ""),
      active: body.active !== false,
      created_at: now(),
      updated_at: now(),
    };
    people.push(newMember);
    return HttpResponse.json(newMember, { status: 201 });
  }),

  http.put("/api/members/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    people[idx] = { ...people[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(people[idx]);
  }),

  http.delete("/api/members/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    people.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Volunteers — derived from the people store (role: "volunteer")
  // ──────────────────────────────────────────────────────────────
  http.get("/api/volunteers", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(people.filter((p) => (p.roles as string[]).includes("volunteer")));
  }),

  http.post("/api/volunteers", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newVol = {
      id: uid(),
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      roles: ["volunteer"],
      national_register_number: null,
      eid_document_number: null,
      visits_per_month: null,
      club_name: "",
      notes: String(body.notes ?? ""),
      active: body.active !== false,
      created_at: now(),
      updated_at: now(),
    };
    people.push(newVol);
    return HttpResponse.json(newVol, { status: 201 });
  }),

  http.put("/api/volunteers/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    people[idx] = { ...people[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(people[idx]);
  }),

  http.delete("/api/volunteers/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    people.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Exhibitors
  // ──────────────────────────────────────────────────────────────
  http.get("/api/exhibitors", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(exhibitors);
  }),

  http.get("/api/exhibitors/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const id = Number(params.id);
    const exhibitor = exhibitors.find((e) => e.id === id);
    if (!exhibitor) return HttpResponse.json(null, { status: 404 });
    return HttpResponse.json(exhibitor);
  }),

  http.post("/api/exhibitors", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const maxId = exhibitors.reduce((max, e) => Math.max(max, Number(e.id) || 0), 0);
    const newExhibitor = {
      id: maxId + 1,
      name: String(body.name ?? ""),
      image: String(body.image ?? ""),
      website: String(body.website ?? ""),
      active: body.active !== false,
      type: String(body.type ?? "vendor"),
      contact_person_id: (body.contact_person_id as string | null) ?? null,
      contact_person: null,
      created_at: now(),
      updated_at: now(),
    };
    exhibitors.push(newExhibitor);
    return HttpResponse.json(newExhibitor, { status: 201 });
  }),

  http.put("/api/exhibitors/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const id = Number(params.id);
    const idx = exhibitors.findIndex((e) => e.id === id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    exhibitors[idx] = { ...exhibitors[idx]!, ...body, id, updated_at: now() };
    return HttpResponse.json(exhibitors[idx]);
  }),

  http.delete("/api/exhibitors/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const id = Number(params.id);
    const idx = exhibitors.findIndex((e) => e.id === id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    exhibitors.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Editions (admin)
  // ──────────────────────────────────────────────────────────────
  http.get("/api/editions/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const edition = editions.find((e) => e.id === params.id);
    if (!edition) return HttpResponse.json(null, { status: 404 });
    return HttpResponse.json(edition);
  }),

  http.post("/api/editions", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newEdition = {
      id: uid(),
      year: Number(body.year ?? new Date().getFullYear()),
      month: String(body.month ?? "march"),
      edition_type: String(body.edition_type ?? "festival"),
      external_partner: null,
      external_contact_name: null,
      external_contact_email: null,
      dates: Array.isArray(body.dates) ? (body.dates as string[]) : [],
      venue: body.venue ?? null,
      events: [],
      producers: [],
      sponsors: [],
      active: body.active === true,
      created_at: now(),
      updated_at: now(),
    };
    editions.push(newEdition as SeedEdition);
    return HttpResponse.json(newEdition, { status: 201 });
  }),

  http.put("/api/editions/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = editions.findIndex((e) => e.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    editions[idx] = { ...editions[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(editions[idx]);
  }),

  http.delete("/api/editions/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = editions.findIndex((e) => e.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    editions.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Events (admin)
  // ──────────────────────────────────────────────────────────────
  http.get("/api/events/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const event = events.find((e) => e.id === params.id);
    if (!event) return HttpResponse.json(null, { status: 404 });
    return HttpResponse.json(event);
  }),

  http.post("/api/events", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const edition = editions.find((e) => e.id === body.edition_id);
    const newEvent = {
      id: uid(),
      edition_id: String(body.edition_id ?? ""),
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      date: String(body.date ?? ""),
      start_time: String(body.start_time ?? ""),
      end_time: typeof body.end_time === "string" ? body.end_time : null,
      category: String(body.category ?? ""),
      registration_required: body.registration_required === true,
      registrations_open_from:
        typeof body.registrations_open_from === "string" ? body.registrations_open_from : null,
      max_capacity: typeof body.max_capacity === "number" ? body.max_capacity : null,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
      active: body.active !== false,
      edition: edition
        ? {
            id: edition.id,
            year: edition.year,
            month: edition.month,
            edition_type: edition.edition_type,
            active: edition.active,
          }
        : null,
      created_at: now(),
      updated_at: now(),
    };
    events.push(newEvent as SeedEvent);
    return HttpResponse.json(newEvent, { status: 201 });
  }),

  http.put("/api/events/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = events.findIndex((e) => e.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    events[idx] = { ...events[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(events[idx]);
  }),

  http.delete("/api/events/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = events.findIndex((e) => e.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    events.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Venues
  // ──────────────────────────────────────────────────────────────
  http.get("/api/venues", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(venues);
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
      lat: Number(body.lat ?? 0),
      lng: Number(body.lng ?? 0),
      active: body.active !== false,
      created_at: now(),
      updated_at: now(),
    };
    venues.push(newVenue);
    return HttpResponse.json(newVenue, { status: 201 });
  }),

  http.put("/api/venues/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = venues.findIndex((v) => v.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    venues[idx] = { ...venues[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(venues[idx]);
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
    return HttpResponse.json(rooms);
  }),

  http.post("/api/rooms", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newRoom = {
      id: uid(),
      venue_id: String(body.venue_id ?? ""),
      name: String(body.name ?? ""),
      width_m: Number(body.width_m ?? 10),
      length_m: Number(body.length_m ?? 10),
      color: String(body.color ?? "#4a90d9"),
      active: body.active !== false,
      created_at: now(),
      updated_at: now(),
    };
    rooms.push(newRoom);
    return HttpResponse.json(newRoom, { status: 201 });
  }),

  http.put("/api/rooms/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = rooms.findIndex((r) => r.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    rooms[idx] = { ...rooms[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(rooms[idx]);
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
    return HttpResponse.json(tableTypes);
  }),

  http.post("/api/table-types", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newTT = {
      id: uid(),
      name: String(body.name ?? ""),
      shape: String(body.shape ?? "round"),
      width_m: Number(body.width_m ?? 1),
      length_m: Number(body.length_m ?? 1),
      height_type: String(body.height_type ?? "high"),
      max_capacity: Number(body.max_capacity ?? 4),
      active: body.active !== false,
      created_at: now(),
      updated_at: now(),
    };
    tableTypes.push(newTT);
    return HttpResponse.json(newTT, { status: 201 });
  }),

  http.put("/api/table-types/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tableTypes.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    tableTypes[idx] = { ...tableTypes[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(tableTypes[idx]);
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
    return HttpResponse.json(tables);
  }),

  http.post("/api/tables", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newTable = {
      id: uid(),
      name: String(body.name ?? ""),
      capacity: Number(body.capacity ?? 4),
      x: Number(body.x ?? 50),
      y: Number(body.y ?? 50),
      table_type_id: String(body.table_type_id ?? ""),
      rotation: Number(body.rotation ?? 0),
      layout_id: String(body.layout_id ?? ""),
      registration_ids: [],
      created_at: now(),
      updated_at: now(),
    };
    tables.push(newTable);
    return HttpResponse.json(newTable, { status: 201 });
  }),

  http.put("/api/tables/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tables.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    tables[idx] = { ...tables[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(tables[idx]);
  }),

  http.patch("/api/tables/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tables.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    tables[idx] = { ...tables[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(tables[idx]);
  }),

  http.delete("/api/tables/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = tables.findIndex((t) => t.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    tables.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Layouts
  // ──────────────────────────────────────────────────────────────
  http.get("/api/layouts", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(layouts);
  }),

  http.post("/api/layouts", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newLayout = {
      id: uid(),
      edition_id: typeof body.edition_id === "string" ? body.edition_id : null,
      room_id: String(body.room_id ?? ""),
      day_id: Number(body.day_id ?? 1),
      date: typeof body.date === "string" ? body.date : null,
      label: String(body.label ?? ""),
      created_at: now(),
      updated_at: now(),
    };
    layouts.push(newLayout);
    return HttpResponse.json(newLayout, { status: 201 });
  }),

  http.put("/api/layouts/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = layouts.findIndex((l) => l.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    layouts[idx] = { ...layouts[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(layouts[idx]);
  }),

  http.delete("/api/layouts/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = layouts.findIndex((l) => l.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    layouts.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Areas
  // ──────────────────────────────────────────────────────────────
  http.get("/api/areas", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(areas);
  }),

  http.post("/api/areas", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newArea = {
      id: uid(),
      layout_id: String(body.layout_id ?? ""),
      icon: String(body.icon ?? "bi-person-standing"),
      exhibitor_id: typeof body.exhibitor_id === "number" ? body.exhibitor_id : null,
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
    return HttpResponse.json(newArea, { status: 201 });
  }),

  http.put("/api/areas/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = areas.findIndex((a) => a.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    areas[idx] = { ...areas[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(areas[idx]);
  }),

  http.patch("/api/areas/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = areas.findIndex((a) => a.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    areas[idx] = { ...areas[idx]!, ...body, id: String(params.id), updated_at: now() };
    return HttpResponse.json(areas[idx]);
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

/** Reset all admin mutable state (useful for tests). */
export function resetAdminStore(): void {
  resetSharedStore();
  resetEditionStore();
  people = structuredClone(seedPeople);
  exhibitors = structuredClone(seedExhibitors);
  venues = structuredClone(seedVenues);
  rooms = structuredClone(seedRooms);
  tableTypes = structuredClone(seedTableTypes);
  tables = structuredClone(seedTables);
  layouts = structuredClone(seedLayouts);
  areas = structuredClone(seedAreas);
}

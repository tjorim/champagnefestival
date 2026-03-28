import { http, HttpResponse } from "msw";
import { activeEdition, seedEditions, seedEvents } from "../data/editions";
import { seedRegistrations } from "../data/registrations";

/** Mutable in-memory store for registrations (public submissions). */
let registrations: Record<string, unknown>[] = structuredClone(seedRegistrations);

export const publicHandlers = [
  /** GET /api/editions/active — returns the active edition. */
  http.get("/api/editions/active", () => {
    return HttpResponse.json(activeEdition);
  }),

  /** GET /api/editions — returns all editions (also used by admin with include_inactive). */
  http.get("/api/editions", ({ request }) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    const editions = includeInactive ? seedEditions : seedEditions.filter((e) => e.active);
    return HttpResponse.json(editions);
  }),

  /** GET /api/events — supports ?registration_required and ?edition_id filters. */
  http.get("/api/events", ({ request }) => {
    const url = new URL(request.url);
    const registrationRequired = url.searchParams.get("registration_required");
    const editionId = url.searchParams.get("edition_id");

    let events = [...seedEvents];
    if (registrationRequired === "true") {
      events = events.filter((e) => e.registration_required);
    }
    if (editionId) {
      events = events.filter((e) => e.edition_id === editionId);
    }
    return HttpResponse.json(events);
  }),

  /** POST /api/registrations — public registration submission. */
  http.post("/api/registrations", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    // Basic honeypot check
    if (typeof body.honeypot === "string" && body.honeypot.length > 0) {
      return HttpResponse.json(null, { status: 400 });
    }

    const newReg = {
      id: `reg-${Date.now()}`,
      person_id: `person-new-${Date.now()}`,
      person: {
        id: `person-new-${Date.now()}`,
        name: String(body.name ?? ""),
        email: String(body.email ?? ""),
        phone: String(body.phone ?? ""),
      },
      event_id: String(body.event_id ?? ""),
      event: seedEvents.find((e) => e.id === body.event_id) ?? null,
      guest_count: Number(body.guest_count ?? 1),
      pre_orders: Array.isArray(body.pre_orders) ? body.pre_orders : [],
      notes: String(body.notes ?? ""),
      accessibility_note: "",
      table_id: null,
      status: "pending",
      payment_status: "unpaid",
      checked_in: false,
      checked_in_at: null,
      strap_issued: false,
      check_in_token: `mock-token-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    registrations.push(newReg);
    return HttpResponse.json(newReg, { status: 201 });
  }),

  /** POST /api/registrations/my/request — request lookup email. */
  http.post("/api/registrations/my/request", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const email = String(body.email ?? "");

    if (!email.includes("@")) {
      return HttpResponse.json({ detail: "Invalid email address." }, { status: 422 });
    }

    return HttpResponse.json({
      ok: true,
      delivery_mode: "email",
      expires_in_minutes: 30,
    });
  }),

  /** POST /api/registrations/my/access — fetch my registrations by token. */
  http.post("/api/registrations/my/access", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "");

    // Accept any non-empty token and return all registrations (dev convenience)
    if (!token) {
      return HttpResponse.json(null, { status: 401 });
    }

    const myRegs = registrations.map((r) => ({
      id: r.id,
      event_title: (r.event as Record<string, unknown> | null | undefined)?.title ?? "",
      guest_count: r.guest_count,
      status: r.status,
      payment_status: r.payment_status,
      checked_in: r.checked_in,
      checked_in_at: r.checked_in_at ?? null,
      strap_issued: r.strap_issued,
      created_at: r.created_at,
      pre_orders: r.pre_orders,
    }));

    return HttpResponse.json(myRegs);
  }),

  /** POST /api/check-in/:id/lookup — look up a registration for check-in. */
  http.post("/api/check-in/:id/lookup", async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "");

    const reg = registrations.find((r) => r.id === id);
    if (!reg) {
      return HttpResponse.json(null, { status: 404 });
    }

    if (token !== String(reg.check_in_token ?? "")) {
      return HttpResponse.json(null, { status: 401 });
    }

    const regPerson = reg.person as Record<string, unknown>;
    const regEvent = reg.event as Record<string, unknown> | null | undefined;
    return HttpResponse.json({
      id: reg.id,
      name: regPerson?.name ?? "",
      event_id: reg.event_id,
      event_title: regEvent?.title ?? "",
      guest_count: reg.guest_count,
      pre_orders: reg.pre_orders,
      notes: reg.notes,
      accessibility_note: reg.accessibility_note,
      status: reg.status,
      checked_in: reg.checked_in,
      checked_in_at: reg.checked_in_at,
      strap_issued: reg.strap_issued,
    });
  }),

  /** POST /api/check-in/:id — perform the check-in. */
  http.post("/api/check-in/:id", async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "");

    const reg = registrations.find((r) => r.id === id);
    if (!reg) {
      return HttpResponse.json(null, { status: 404 });
    }

    if (token !== String(reg.check_in_token ?? "")) {
      return HttpResponse.json(null, { status: 401 });
    }

    const alreadyCheckedIn = Boolean(reg.checked_in);
    if (!alreadyCheckedIn) {
      reg.checked_in = true;
      reg.checked_in_at = new Date().toISOString();
      reg.strap_issued = body.issue_strap === true;
      reg.updated_at = new Date().toISOString();
    }

    const regPerson2 = reg.person as Record<string, unknown>;
    const regEvent2 = reg.event as Record<string, unknown> | null | undefined;
    return HttpResponse.json({
      already_checked_in: alreadyCheckedIn,
      registration: {
        id: reg.id,
        name: regPerson2?.name ?? "",
        event_id: reg.event_id,
        event_title: regEvent2?.title ?? "",
        guest_count: reg.guest_count,
        pre_orders: reg.pre_orders,
        notes: reg.notes,
        accessibility_note: reg.accessibility_note,
        status: reg.status,
        checked_in: reg.checked_in,
        checked_in_at: reg.checked_in_at,
        strap_issued: reg.strap_issued,
      },
    });
  }),
];

/** Reset public mutable state (useful for tests). */
export function resetPublicStore(): void {
  registrations = structuredClone(seedRegistrations);
}

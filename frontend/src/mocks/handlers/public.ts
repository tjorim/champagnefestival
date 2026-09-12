import { http, HttpResponse } from "msw";
import { editions, events, type SeedEdition } from "../data/editionStore";
import { sharedStore, resetSharedStore } from "../data/registrations";
import { seedTables } from "../data/venue";

function hydrateEditionEvents(edition: SeedEdition): SeedEdition {
  const editionEvents = [...events.filter((event) => event.edition_id === edition.id)].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.start_time.localeCompare(right.start_time) ||
      left.created_at.localeCompare(right.created_at),
  );
  const dates = [...new Set(editionEvents.map((event) => event.date))].sort();

  return {
    ...edition,
    dates,
    events: editionEvents,
  };
}

function isUpcomingEdition(edition: SeedEdition): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const endDate = edition.dates.at(-1);
  return Boolean(endDate && endDate >= today);
}

const publicFaqItemsByLocale = {
  en: [
    {
      id: "faq-champagnefestival",
      question: "What is the Champagnefestival?",
      answer: "An annual festival dedicated to champagne.",
    },
  ],
  fr: [
    {
      id: "faq-champagnefestival",
      question: "Qu’est-ce que le Champagnefestival ?",
      answer: "Un festival annuel consacré au champagne.",
    },
  ],
  nl: [
    {
      id: "faq-champagnefestival",
      question: "Wat is het Champagnefestival?",
      answer: "Een jaarlijks festival waar champagne centraal staat.",
    },
  ],
} as const;

export const publicHandlers = [
  /** GET /api/settings — site-wide settings; maintenance mode off by default. */
  http.get("/api/settings", () =>
    HttpResponse.json({
      maintenance_mode: false,
      public_email: "nancy.cattrysse@telenet.be",
      public_phone: "+32 478 48 01 77",
      facebook_url: "https://www.facebook.com/champagnefestival.kust",
    }),
  ),

  /** GET /api/faq/active — returns a deterministic localized public FAQ item. */
  http.get("/api/faq/active", ({ request }) => {
    const locale = new URL(request.url).searchParams.getAll("locale").at(-1) ?? "nl";
    if (!Object.hasOwn(publicFaqItemsByLocale, locale)) {
      return HttpResponse.json(
        {
          detail: [
            {
              type: "literal_error",
              loc: ["query", "locale"],
              msg: "Input should be 'nl', 'en' or 'fr'",
              input: locale,
              ctx: { expected: "'nl', 'en' or 'fr'" },
            },
          ],
        },
        { status: 422 },
      );
    }
    return HttpResponse.json(publicFaqItemsByLocale[locale as keyof typeof publicFaqItemsByLocale]);
  }),

  /** GET /api/editions/active — returns the active edition. */
  http.get("/api/editions/active", ({ request }) => {
    const editionType = new URL(request.url).searchParams.get("edition_type");
    const matching = editions.filter(
      (e) => e.active && (!editionType || e.edition_type === editionType),
    );
    return HttpResponse.json(matching[0] ?? null);
  }),

  /** GET /api/editions/upcoming — returns upcoming public editions, optionally by type. */
  http.get("/api/editions/upcoming", ({ request }) => {
    const editionType = new URL(request.url).searchParams.get("edition_type");
    const result = editions
      .filter((edition) => edition.active && (!editionType || edition.edition_type === editionType))
      .map(hydrateEditionEvents)
      .filter(isUpcomingEdition);
    return HttpResponse.json(result);
  }),

  /** GET /api/editions — returns all editions (also used by admin with include_inactive). */
  http.get("/api/editions", ({ request }) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    const result = includeInactive ? editions : editions.filter((e) => e.active);
    return HttpResponse.json(result);
  }),

  /** GET /api/events — supports ?registration_required and ?edition_id filters. */
  http.get("/api/events", ({ request }) => {
    const url = new URL(request.url);
    const registrationRequired = url.searchParams.get("registration_required");
    const editionId = url.searchParams.get("edition_id");

    let result = [...events];
    if (registrationRequired === "true") {
      result = result.filter((e) => e.registration_required);
    }
    if (editionId) {
      result = result.filter((e) => e.edition_id === editionId);
    }
    return HttpResponse.json(result);
  }),

  /** POST /api/registrations — public registration submission. */
  http.post("/api/registrations", async ({ request }) => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return HttpResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }

    // Basic honeypot check
    if (typeof body.honeypot === "string" && body.honeypot.length > 0) {
      return HttpResponse.json(null, { status: 400 });
    }

    const ts = Date.now();
    const newReg = {
      id: `reg-${ts}`,
      person_id: `person-new-${ts}`,
      person: {
        id: `person-new-${ts}`,
        name: String(body.name ?? ""),
        email: String(body.email ?? ""),
        phone: String(body.phone ?? ""),
      },
      event_id: String(body.event_id ?? ""),
      event: events.find((e) => e.id === body.event_id) ?? null,
      guest_count: Number(body.guest_count ?? 1),
      order_items: Array.isArray(body.order_items) ? body.order_items : [],
      notes: String(body.notes ?? ""),
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
    sharedStore.registrations.push(newReg);
    return HttpResponse.json(newReg, { status: 201 });
  }),

  /** POST /api/visitor-sessions/request — request a passwordless magic link (#953). */
  http.post("/api/visitor-sessions/request", async ({ request }) => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return HttpResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }
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

  /** POST /api/visitor-sessions/redeem — redeem a magic link, establishing a session (#953). */
  http.post("/api/visitor-sessions/redeem", async ({ request }) => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return HttpResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }
    const token = String(body.token ?? "");

    if (!token) {
      return HttpResponse.json(null, { status: 401 });
    }

    const myRegs = sharedStore.registrations.map((r) => ({
      id: r.id,
      event_title: (r.event as Record<string, unknown> | null | undefined)?.title ?? "",
      event_date: (r.event as Record<string, unknown> | null | undefined)?.date ?? null,
      check_in_token: r.check_in_token ?? `mock-token-${r.id}`,
      guest_count: r.guest_count,
      status: r.status,
      payment_status: r.payment_status,
      checked_in: r.checked_in,
      checked_in_at: r.checked_in_at ?? null,
      strap_issued: r.strap_issued,
      created_at: r.created_at,
      order_items: r.order_items,
    }));

    return HttpResponse.json(myRegs);
  }),

  /** GET /api/visitor-sessions/status — no session by default in tests (#953). */
  http.get("/api/visitor-sessions/status", () =>
    HttpResponse.json({ authenticated: false, expires_at: null }),
  ),

  /** GET /api/me/registrations — no owned registrations by default in
   * tests; override with server.use for tests that exercise a signed-in
   * member/volunteer's direct-fetch path. */
  http.get("/api/me/registrations", () => HttpResponse.json([])),

  /** GET /api/me/registrations/claimable — no claimable candidates by
   * default in tests (#1044); override with server.use for tests that
   * exercise the confirm-first claim card. */
  http.get("/api/me/registrations/claimable", () => HttpResponse.json([])),

  /** POST /api/visitor-sessions/sign-out — always succeeds (#953). */
  http.post("/api/visitor-sessions/sign-out", () => new HttpResponse(null, { status: 204 })),

  /** POST /api/check-in/:id/lookup — look up a registration for check-in. */
  http.post("/api/check-in/:id/lookup", async ({ params, request }) => {
    const { id } = params;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return HttpResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }
    const token = String(body.token ?? "");

    const reg = sharedStore.registrations.find((r) => r.id === id);
    if (!reg) {
      return HttpResponse.json(null, { status: 404 });
    }

    if (token !== String(reg.check_in_token ?? "")) {
      return HttpResponse.json(null, { status: 401 });
    }

    const regPerson = reg.person as Record<string, unknown>;
    const regEvent = reg.event as Record<string, unknown> | null | undefined;
    const regTable = seedTables.find((table) => table.id === reg.table_id);
    return HttpResponse.json({
      id: reg.id,
      name: regPerson?.name ?? "",
      event_id: reg.event_id,
      event_title: regEvent?.title ?? "",
      table_name: regTable?.name ?? null,
      guest_count: reg.guest_count,
      order_items: reg.order_items,
      notes: reg.notes,
      status: reg.status,
      checked_in: reg.checked_in,
      checked_in_at: reg.checked_in_at,
      strap_issued: reg.strap_issued,
    });
  }),

  /** POST /api/check-in/:id — perform the check-in. */
  http.post("/api/check-in/:id", async ({ params, request }) => {
    const { id } = params;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return HttpResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }
    const token = String(body.token ?? "");

    const idx = sharedStore.registrations.findIndex((r) => r.id === id);
    if (idx === -1) {
      return HttpResponse.json(null, { status: 404 });
    }
    const reg = sharedStore.registrations[idx]!;

    if (token !== String(reg.check_in_token ?? "")) {
      return HttpResponse.json(null, { status: 401 });
    }

    const alreadyCheckedIn = Boolean(reg.checked_in);
    if (!alreadyCheckedIn) {
      sharedStore.registrations[idx] = {
        ...reg,
        checked_in: true,
        checked_in_at: new Date().toISOString(),
        strap_issued: body.issue_strap === true,
        updated_at: new Date().toISOString(),
      };
    }

    const updatedReg = sharedStore.registrations[idx]!;
    const regPerson2 = updatedReg.person as Record<string, unknown>;
    const regEvent2 = updatedReg.event as Record<string, unknown> | null | undefined;
    const regTable2 = seedTables.find((table) => table.id === updatedReg.table_id);
    return HttpResponse.json({
      already_checked_in: alreadyCheckedIn,
      registration: {
        id: updatedReg.id,
        name: regPerson2?.name ?? "",
        event_id: updatedReg.event_id,
        event_title: regEvent2?.title ?? "",
        table_name: regTable2?.name ?? null,
        guest_count: updatedReg.guest_count,
        order_items: updatedReg.order_items,
        notes: updatedReg.notes,
        status: updatedReg.status,
        checked_in: updatedReg.checked_in,
        checked_in_at: updatedReg.checked_in_at,
        strap_issued: updatedReg.strap_issued,
      },
    });
  }),

  /** GET /api/push/vapid-public-key — Web Push foundation (#941). Enabled by
   * default so component tests exercising the opt-in card don't need their
   * own override; tests for the disabled/unsupported states use
   * `server.use(...)` to shadow this. */
  http.get("/api/push/vapid-public-key", () =>
    HttpResponse.json({
      public_key: "BNJxw-mock-vapid-public-key-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      enabled: true,
    }),
  ),

  /** POST /api/push/subscriptions — natural-key upsert by endpoint (#941). */
  http.post("/api/push/subscriptions", async ({ request }) => {
    const body = (await request.json()) as {
      categories?: string[];
      event_ids?: string[];
    };
    return HttpResponse.json(
      {
        id: "mock-push-subscription-id",
        categories: body.categories ?? ["system_test"],
        event_ids: body.event_ids ?? [],
      },
      { status: 201 },
    );
  }),

  /** POST /api/push/subscriptions/unsubscribe — convergent delete (#941). */
  http.post("/api/push/subscriptions/unsubscribe", () => new HttpResponse(null, { status: 204 })),
];

/** Reset public mutable state (useful for tests). */
export function resetPublicStore(): void {
  resetSharedStore();
}

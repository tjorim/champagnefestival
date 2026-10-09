import { http, HttpResponse } from "msw";
import {
  editions,
  events,
  resetEditionStore,
  type SeedEdition,
  type SeedEvent,
  type SeedProduct,
  type SeedProductInclusion,
} from "../data/editionStore";
import { seedEventCategories, seedProductCategories, type SeedCategory } from "../data/categories";
import { seedOrganizations } from "../data/organizations";
import { seedPeople } from "../data/people";
import {
  type RegistrationScenario,
  sharedStore,
  resetSharedStore,
  setRegistrationScenario,
} from "../data/registrations";
import {
  seedAreas,
  seedLayouts,
  seedRooms,
  seedTableTypes,
  seedTables,
  seedVenues,
} from "../data/venue";

/** Mutable in-memory stores — reset on page reload. */
let people: Record<string, unknown>[] = structuredClone(seedPeople);
let organizations: Record<string, unknown>[] = structuredClone(seedOrganizations);
const eventCategories = { items: structuredClone(seedEventCategories) };
const productCategories = { items: structuredClone(seedProductCategories) };
let venues: Record<string, unknown>[] = structuredClone(seedVenues);
let rooms: Record<string, unknown>[] = structuredClone(seedRooms);
let tableTypes: Record<string, unknown>[] = structuredClone(seedTableTypes);
let tables: Record<string, unknown>[] = structuredClone(seedTables);
let layouts: Record<string, unknown>[] = structuredClone(seedLayouts);
let areas: Record<string, unknown>[] = structuredClone(seedAreas);

const validAdminTokens = new Set(["dev-token", "mock-access-token"]);
type AuthScenario = "signed-out" | "forbidden" | "expired" | "invalid";
type ForcedAuthScenario = "default" | AuthScenario;
type MockScenario = "default" | RegistrationScenario | `auth-${AuthScenario}`;

let activeScenario: MockScenario = "default";
let forcedAuthScenario: ForcedAuthScenario = "default";
const availableMockScenarios: MockScenario[] = [
  "default",
  "event-day",
  "auth-signed-out",
  "auth-forbidden",
  "auth-expired",
  "auth-invalid",
];

function authError(status: number, detail: string): HttpResponse<{ detail: string }> {
  return HttpResponse.json({ detail }, { status });
}

function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function requireAuth(request: Request): HttpResponse<{ detail: string }> | null {
  if (forcedAuthScenario === "signed-out") {
    return authError(401, "Not authenticated");
  }
  if (forcedAuthScenario === "forbidden") {
    return authError(403, "Forbidden");
  }
  if (forcedAuthScenario === "expired") {
    return authError(401, "Token expired");
  }
  if (forcedAuthScenario === "invalid") {
    return authError(401, "Invalid token");
  }

  const token = parseBearerToken(request);
  if (!token) return authError(401, "Not authenticated");
  if (token === "forbidden-token") return authError(403, "Forbidden");
  if (token === "expired-token") return authError(401, "Token expired");
  if (token === "invalid-token") return authError(401, "Invalid token");
  if (!validAdminTokens.has(token)) return authError(401, "Invalid token");

  return null;
}

function applyMockScenario(scenario: MockScenario): void {
  activeScenario = scenario;
  forcedAuthScenario = "default";

  switch (scenario) {
    case "default":
      resetSharedStore();
      return;
    case "event-day":
      setRegistrationScenario("event-day");
      return;
    case "auth-signed-out":
      forcedAuthScenario = "signed-out";
      return;
    case "auth-forbidden":
      forcedAuthScenario = "forbidden";
      return;
    case "auth-expired":
      forcedAuthScenario = "expired";
      return;
    case "auth-invalid":
      forcedAuthScenario = "invalid";
      return;
  }
}

function tablesWithRegistrationAssignments(): Record<string, unknown>[] {
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
      event_id: layouts.find((l) => l.id === table.layout_id)?.event_id,
      registration_ids: registrationIds,
    };
  });
}

/** The per-language event text of a create/update body, with `title`/`description` resolved to the original language. */
function eventTextFromBody(body: Record<string, unknown>) {
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : null);
  const language =
    body.title_language === "fr" || body.title_language === "en" ? body.title_language : "nl";
  const descriptionLanguage =
    body.description_language === "fr" || body.description_language === "en"
      ? body.description_language
      : body.description_language === "nl"
        ? "nl"
        : null;
  const fields = {
    title_language: language,
    title_nl: text("title_nl"),
    title_fr: text("title_fr"),
    title_en: text("title_en"),
    description_language: descriptionLanguage,
    description_nl: text("description_nl"),
    description_fr: text("description_fr"),
    description_en: text("description_en"),
  };
  return {
    ...fields,
    title: fields[`title_${language}`] ?? "",
    description: (descriptionLanguage && fields[`description_${descriptionLanguage}`]) || "",
  };
}

function asLanguage(value: unknown): "nl" | "fr" | "en" | null {
  return value === "nl" || value === "fr" || value === "en" ? value : null;
}

/** The per-language product text of a create/update body, with `name`/`description` resolved to the original language. */
function productTextFromBody(body: Record<string, unknown>) {
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : null);
  const language = asLanguage(body.name_language) ?? "en";
  const descriptionLanguage = asLanguage(body.description_language);
  const fields = {
    name_language: language,
    name_nl: text("name_nl"),
    name_fr: text("name_fr"),
    name_en: text("name_en"),
    description_language: descriptionLanguage,
    description_nl: text("description_nl"),
    description_fr: text("description_fr"),
    description_en: text("description_en"),
  };
  return {
    ...fields,
    name: fields[`name_${language}`] ?? "",
    description: (descriptionLanguage && fields[`description_${descriptionLanguage}`]) || "",
  };
}

/** The in-memory CRUD handlers of an event or product category list. */
function categoryHandlers(
  noun: "event" | "product",
  path: string,
  store: { items: (SeedCategory & { label: string })[] },
  inUse: (key: string) => boolean,
) {
  const sort = () =>
    store.items.sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
  return [
    http.get(path, () => HttpResponse.json(store.items)),
    http.post(path, async ({ request }) => {
      const authError = requireAuth(request);
      if (authError) return authError;
      const body = (await request.json()) as Record<string, string | number | null>;
      const key = String(body.key ?? "");
      if (store.items.some((category) => category.key === key)) {
        return HttpResponse.json(
          { detail: `${noun} category '${key}' already exists.` },
          { status: 409 },
        );
      }
      const language: "nl" | "fr" | "en" =
        body.label_language === "fr" || body.label_language === "en" ? body.label_language : "nl";
      const created = {
        key,
        label_language: language,
        label_nl: (body.label_nl as string | null) ?? null,
        label_fr: (body.label_fr as string | null) ?? null,
        label_en: (body.label_en as string | null) ?? null,
        sort_order: Number(body.sort_order ?? 0),
        created_at: now(),
        updated_at: now(),
      };
      const category = { ...created, label: created[`label_${language}`] ?? key };
      store.items.push(category);
      sort();
      return HttpResponse.json(category, { status: 201 });
    }),
    http.put(`${path}/:key`, async ({ request, params }) => {
      const authError = requireAuth(request);
      if (authError) return authError;
      const index = store.items.findIndex((category) => category.key === params.key);
      if (index === -1) return HttpResponse.json(null, { status: 404 });
      const body = (await request.json()) as Record<string, unknown>;
      const merged = { ...store.items[index]!, ...body, updated_at: now() };
      store.items[index] = {
        ...merged,
        label: merged[`label_${merged.label_language}`] ?? merged.key,
      };
      return HttpResponse.json(store.items[index]);
    }),
    http.delete(`${path}/:key`, ({ request, params }) => {
      const authError = requireAuth(request);
      if (authError) return authError;
      const key = String(params.key);
      if (inUse(key)) {
        return HttpResponse.json(
          { detail: `Cannot delete ${noun} category '${key}': ${noun}s still use it.` },
          { status: 409 },
        );
      }
      store.items = store.items.filter((category) => category.key !== key);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

function uid(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function now(): string {
  return new Date().toISOString();
}

function registrationToCheckInResponse(
  registration: Record<string, unknown>,
): Record<string, unknown> {
  const person = registration.person as Record<string, unknown> | undefined;
  const event = registration.event as Record<string, unknown> | null | undefined;
  const table = tables.find((item) => item.id === registration.table_id);
  return {
    id: registration.id,
    name: person?.name ?? "",
    event_id: registration.event_id,
    event_title: event?.title ?? "",
    table_id: registration.table_id ?? null,
    table_name: table?.name ?? null,
    guest_count: registration.guest_count,
    order_items: registration.order_items,
    notes: registration.notes,
    status: registration.status,
    checked_in: registration.checked_in,
    checked_in_at: registration.checked_in_at,
    strap_issued: registration.strap_issued,
  };
}

/** Mirrors the paged people contract for authenticated UI tests. */
function filteredPeople(url: URL, role?: string) {
  const active = url.searchParams.get("active");
  const requestedRole = role ?? url.searchParams.get("role");
  const q = url.searchParams.get("q")?.toLowerCase().trim();
  return people.filter(
    (person) =>
      (active === null || Boolean(person.active) === (active === "true")) &&
      (!requestedRole || (person.roles as string[]).includes(requestedRole)) &&
      (!q ||
        [
          "name",
          "email",
          "phone",
          "address",
          "national_register_number",
          "eid_document_number",
          "club_name",
          "notes",
        ].some((field) =>
          String(person[field] ?? "")
            .toLowerCase()
            .includes(q),
        ) ||
        (person.roles as string[]).some((value) => value.includes(q))),
  );
}
function peopleEnvelope(url: URL, role?: string) {
  const rows: Record<string, unknown>[] = filteredPeople(url, role).map((person) => ({
    ...person,
    registration_count: sharedStore.registrations.filter(
      (registration) => registration.person_id === person.id,
    ).length,
  }));
  const sort = url.searchParams.get("sort");
  const field = sort === "created" ? "created_at" : sort === "updated" ? "updated_at" : sort;
  const direction = url.searchParams.get("sort_dir") === "desc" ? -1 : 1;
  if (field)
    rows.sort((a, b) => {
      const left = a[field as keyof typeof a];
      const right = b[field as keyof typeof b];
      return (
        direction *
          (typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""))) ||
        String(a.id).localeCompare(String(b.id))
      );
    });
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const page = Number(url.searchParams.get("page") ?? 1);
  return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, limit, page };
}

export const adminHandlers = [
  http.get("/api/mock/scenario", () => {
    return HttpResponse.json({
      active: activeScenario,
      available: availableMockScenarios,
    });
  }),

  http.post("/api/mock/scenario", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { scenario?: string } | null;
    const scenario = body?.scenario as MockScenario | undefined;
    const availableScenarios = new Set<MockScenario>(availableMockScenarios);
    if (!scenario || !availableScenarios.has(scenario)) {
      return HttpResponse.json(
        {
          detail: "Unknown scenario",
          available: [...availableScenarios],
        },
        { status: 400 },
      );
    }
    applyMockScenario(scenario);
    return HttpResponse.json({ ok: true, active: activeScenario });
  }),

  // ──────────────────────────────────────────────────────────────
  // Auth validation: GET /api/registrations returns 200 or 401
  // ──────────────────────────────────────────────────────────────
  http.get("/api/registrations", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status") ?? "";
    // `q`/`status` are honored so tests can exercise search filtering and
    // pagination together; the remaining filters (edition, date, person,
    // sort) are exercised against the real endpoint by the backend test
    // suite — this mock only needs to prove RegistrationList paginates and
    // searches correctly against whatever the envelope reports.
    const filtered = sharedStore.registrations.filter((registration) => {
      if (status && registration.status !== status) return false;
      if (!query) return true;
      const person = registration.person as Record<string, unknown> | undefined;
      const event = registration.event as Record<string, unknown> | undefined;
      return [person?.name, person?.email, registration.id, registration.event_id, event?.title]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(query));
    });
    const limit = Number(url.searchParams.get("limit") ?? filtered.length) || filtered.length;
    const page = Number(url.searchParams.get("page") ?? 1) || 1;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    return HttpResponse.json({ items, total: filtered.length, limit, page });
  }),

  http.get("/api/volunteer/registrations", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Number(url.searchParams.get("limit") ?? 10);

    const matches = sharedStore.registrations.filter((registration) => {
      if (!query) return true;
      const person = registration.person as Record<string, unknown> | undefined;
      const event = registration.event as Record<string, unknown> | undefined;
      return [person?.name, person?.email, registration.id, registration.event_id, event?.title]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(query));
    });

    return HttpResponse.json(matches.slice(0, limit).map(registrationToCheckInResponse));
  }),

  http.post("/api/volunteer/registrations/:id/check-in", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return HttpResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }

    const idx = sharedStore.registrations.findIndex((r) => r.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });

    const reg = sharedStore.registrations[idx]!;
    const alreadyCheckedIn = Boolean(reg.checked_in);
    sharedStore.registrations[idx] = {
      ...reg,
      checked_in: true,
      checked_in_at: alreadyCheckedIn ? reg.checked_in_at : now(),
      strap_issued: Boolean(reg.strap_issued) || body.issue_strap === true,
      updated_at: now(),
    };

    return HttpResponse.json({
      already_checked_in: alreadyCheckedIn,
      registration: registrationToCheckInResponse(sharedStore.registrations[idx]!),
    });
  }),

  http.put("/api/volunteer/registrations/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = sharedStore.registrations.findIndex((r) => r.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    const current = sharedStore.registrations[idx]!;
    const currentOrderItems = Array.isArray(current.order_items)
      ? (current.order_items as Array<Record<string, unknown>>)
      : [];
    let deliveryUpdates: Map<unknown, number> | null = null;
    if (Array.isArray(body.order_items)) {
      deliveryUpdates = new Map();
      for (const item of body.order_items) {
        const update = item as Record<string, unknown>;
        const productId = update.product_id;
        const orderItem = currentOrderItems.find((order) => order.product_id === productId);
        if (!orderItem) {
          return HttpResponse.json(
            { detail: `Product '${String(productId)}' is not on this registration.` },
            { status: 400 },
          );
        }
        const deliveredQuantity = update.delivered_quantity;
        if (typeof deliveredQuantity !== "number" || deliveredQuantity < 0) {
          return HttpResponse.json(
            { detail: "delivered_quantity must be a non-negative number." },
            { status: 400 },
          );
        }
        if (typeof orderItem.quantity !== "number" || deliveredQuantity > orderItem.quantity) {
          return HttpResponse.json(
            {
              detail: `delivered_quantity for product '${String(productId)}' cannot exceed quantity.`,
            },
            { status: 400 },
          );
        }
        deliveryUpdates.set(productId, deliveredQuantity);
      }
    }
    const orderItems = deliveryUpdates
      ? currentOrderItems.map((item) => {
          const deliveredQuantity = deliveryUpdates.get(item.product_id);
          return typeof deliveredQuantity === "number"
            ? {
                ...item,
                delivered_quantity: deliveredQuantity,
                delivered: deliveredQuantity === item.quantity,
              }
            : item;
        })
      : currentOrderItems;
    sharedStore.registrations[idx] = {
      ...current,
      order_items: orderItems,
      ...(typeof body.strap_issued === "boolean" ? { strap_issued: body.strap_issued } : {}),
      updated_at: now(),
    };
    return HttpResponse.json(registrationToCheckInResponse(sharedStore.registrations[idx]!));
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
    const registration = sharedStore.registrations[idx]!;
    if (registration.status === "cancelled") registration.allocations = [];
    const allocations = (registration.allocations ?? []) as { table_id: string }[];
    registration.table_id = allocations[0]?.table_id ?? null;
    return HttpResponse.json(registration);
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
      order_items: [],
      notes: String(body.notes ?? ""),
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
  // Analytics
  // ──────────────────────────────────────────────────────────────
  http.get("/api/editions/stats", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const base = {
      edition_type: "festival",
      start_date: null,
      total_paid: "0",
      total_due: "0",
      total_received: "0",
      total_refunded: "0",
      total_outstanding: "0",
      total_refund_liability: "0",
    };
    return HttpResponse.json([
      {
        ...base,
        edition_id: "edition-2024",
        year: 2024,
        month: "March",
        events_count: 4,
        total_registrations: 62,
        total_guests: 140,
        total_checked_in: 98,
      },
      {
        ...base,
        edition_id: "edition-2025",
        year: 2025,
        month: "March",
        events_count: 5,
        total_registrations: 88,
        total_guests: 190,
        total_checked_in: 171,
      },
      {
        ...base,
        edition_id: "edition-2026",
        year: 2026,
        month: "March",
        events_count: 5,
        total_registrations: 12,
        total_guests: 0,
        total_checked_in: 0,
      },
    ]);
  }),

  // ──────────────────────────────────────────────────────────────
  // People
  // ──────────────────────────────────────────────────────────────
  http.get("/api/people/counts", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const rows = filteredPeople(new URL(request.url));
    const by_role: Record<string, number> = {};
    for (const row of rows)
      for (const role of row.roles as string[]) by_role[role] = (by_role[role] ?? 0) + 1;
    const active = rows.filter((row) => row.active).length;
    return HttpResponse.json({
      total: rows.length,
      active,
      inactive: rows.length - active,
      by_role,
    });
  }),
  http.get("/api/people/by-email", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const url = new URL(request.url);
    const matching = people.filter(
      (row) =>
        String(row.email).toLowerCase() === url.searchParams.get("email")?.toLowerCase() &&
        row.id !== url.searchParams.get("exclude_person_id"),
    );
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const page = Number(url.searchParams.get("page") ?? 1);
    return HttpResponse.json({
      items: matching.slice((page - 1) * limit, page * limit).map((row) => ({
        ...row,
        registration_count: sharedStore.registrations.filter((r) => r.person_id === row.id).length,
      })),
      total: matching.length,
      limit,
      page,
    });
  }),
  http.get("/api/people/export", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const rows = filteredPeople(new URL(request.url));
    return new HttpResponse(
      "name,email\n" + rows.map((row) => `${row.name},${row.email}`).join("\n"),
      { headers: { "Content-Type": "text/csv" } },
    );
  }),
  http.get("/api/people", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(peopleEnvelope(new URL(request.url)));
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
  // Members — derived from the people store (role: "member"). There's no
  // GET /api/members list route (retired — see adminFetch.ts's comment);
  // the member list is read via GET /api/people?role=member instead.
  // ──────────────────────────────────────────────────────────────
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
  http.get("/api/volunteers/export", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const url = new URL(request.url);
    if (!url.searchParams.has("active") && url.searchParams.get("include_inactive") !== "true")
      url.searchParams.set("active", "true");
    return new HttpResponse(
      "name,address\n" +
        filteredPeople(url, "volunteer")
          .map((row) => `${row.name},${row.address}`)
          .join("\n"),
      { headers: { "Content-Type": "text/csv" } },
    );
  }),
  http.get("/api/volunteers", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(peopleEnvelope(new URL(request.url), "volunteer"));
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
    people[idx] = {
      ...people[idx]!,
      roles: (people[idx]!.roles as string[]).filter((role) => role !== "volunteer"),
      help_periods: [],
    };
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Organizations
  // ──────────────────────────────────────────────────────────────
  http.get("/api/me/organizations", ({ request }) => {
    // Same verified contact as the changes handler below; other sessions manage nothing.
    if (forcedAuthScenario !== "default" || parseBearerToken(request) !== "mock-manager-token") {
      return HttpResponse.json([]);
    }
    return HttpResponse.json(organizations.filter((row) => row.contact_person_id === "person-01"));
  }),

  http.get("/api/me/organizations/:id/changes", ({ request, params }) => {
    // This token represents the verified contact for the first seeded organization.
    // Email-session tests override this handler, like the visitor-session mocks.
    const owned = organizations.find(
      (row) => String(row.id) === params.id && row.contact_person_id === "person-01",
    );
    if (
      forcedAuthScenario !== "default" ||
      parseBearerToken(request) !== "mock-manager-token" ||
      !owned
    ) {
      return authError(404, "Organization not found.");
    }
    return HttpResponse.json([]);
  }),

  http.get("/api/organizations/translation", ({ request }) => {
    const error = requireAuth(request);
    return error ?? HttpResponse.json({ languages: [] });
  }),
  http.get("/api/me/organizations/:id/translation", () => HttpResponse.json({ languages: [] })),

  http.get("/api/organizations/changes", ({ request }) => {
    const error = requireAuth(request);
    return error ?? HttpResponse.json([]);
  }),

  http.get("/api/organizations", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return HttpResponse.json(organizations);
  }),

  http.get("/api/organizations/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const id = Number(params.id);
    const organization = organizations.find((e) => e.id === id);
    if (!organization) return HttpResponse.json(null, { status: 404 });
    return HttpResponse.json(organization);
  }),

  http.post("/api/organizations", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const maxId = organizations.reduce((max, e) => Math.max(max, Number(e.id) || 0), 0);
    const newOrganization = {
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
    organizations.push(newOrganization);
    return HttpResponse.json(newOrganization, { status: 201 });
  }),

  http.put("/api/organizations/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const id = Number(params.id);
    const idx = organizations.findIndex((e) => e.id === id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    organizations[idx] = { ...organizations[idx]!, ...body, id, updated_at: now() };
    return HttpResponse.json(organizations[idx]);
  }),

  http.delete("/api/organizations/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const id = Number(params.id);
    const idx = organizations.findIndex((e) => e.id === id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    organizations.splice(idx, 1);
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
      dates: Array.isArray(body.dates) ? (body.dates as string[]) : [],
      venue: body.venue ?? null,
      events: [],
      producers: [],
      sponsors: [],
      vendors: [],
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

  // Must stay ahead of "/api/events/:id", which would otherwise swallow it.
  http.get("/api/events/checkin-stats", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const editionId = new URL(request.url).searchParams.get("edition_id");
    const totals = new Map<string, { total: number; checked_in: number }>();

    for (const registration of sharedStore.registrations) {
      const eventId = registration.event_id;
      if (typeof eventId !== "string" || eventId.length === 0) continue;
      if (registration.status === "cancelled") continue;
      if (editionId) {
        const event = events.find((e) => e.id === eventId);
        if (!event || event.edition_id !== editionId) continue;
      }
      const guests = typeof registration.guest_count === "number" ? registration.guest_count : 0;
      const entry = totals.get(eventId) ?? { total: 0, checked_in: 0 };
      entry.total += guests;
      if (registration.checked_in === true) entry.checked_in += guests;
      totals.set(eventId, entry);
    }

    return HttpResponse.json(
      [...totals.entries()].map(([event_id, entry]) => ({
        event_id,
        event_title: events.find((event) => event.id === event_id)?.title ?? event_id,
        ...entry,
      })),
    );
  }),

  ...categoryHandlers("event", "/api/event-categories", eventCategories, (key) =>
    events.some((event) => event.category === key),
  ),
  ...categoryHandlers("product", "/api/product-categories", productCategories, (key) =>
    events.some((event) => event.products.some((product) => product.category === key)),
  ),

  http.get("/api/events/translation", ({ request }) => {
    const error = requireAuth(request);
    return error ?? HttpResponse.json({ languages: [] });
  }),
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
      ...eventTextFromBody(body),
      date: String(body.date ?? ""),
      start_time: String(body.start_time ?? ""),
      end_time: typeof body.end_time === "string" ? body.end_time : null,
      category: String(body.category ?? ""),
      registration_required: body.registration_required === true,
      registrations_open_from:
        typeof body.registrations_open_from === "string" ? body.registrations_open_from : null,
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
      products: [],
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
    const merged = { ...events[idx]!, ...body, id: String(params.id), updated_at: now() };
    events[idx] = { ...merged, ...eventTextFromBody(merged) };
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
  // Products (admin) — event-scoped, embedded on each SeedEvent
  // ──────────────────────────────────────────────────────────────
  http.get("/api/products", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const url = new URL(request.url);
    const eventId = url.searchParams.get("event_id");
    const all = events.flatMap((e) => e.products);
    return HttpResponse.json(eventId ? all.filter((p) => p.event_id === eventId) : all);
  }),

  http.post("/api/products", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const event = events.find((e) => e.id === body.event_id);
    if (!event) return HttpResponse.json({ detail: "Event not found." }, { status: 404 });
    const newProduct: SeedProduct = {
      id: uid(),
      event_id: String(body.event_id ?? ""),
      ...productTextFromBody(body),
      price: Number(body.price ?? 0),
      category: String(body.category ?? "other"),
      purchasable: body.purchasable !== false,
      required: body.required === true,
      inclusions: Array.isArray(body.inclusions)
        ? (body.inclusions as SeedProductInclusion[])
        : null,
      included_product_id:
        typeof body.included_product_id === "string" ? body.included_product_id : null,
      included_per_guests:
        typeof body.included_per_guests === "number" ? body.included_per_guests : null,
      created_at: now(),
      updated_at: now(),
    };
    event.products.push(newProduct);
    return HttpResponse.json(newProduct, { status: 201 });
  }),

  http.put("/api/products/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    for (const event of events) {
      const idx = event.products.findIndex((p) => p.id === params.id);
      if (idx !== -1) {
        const body = (await request.json()) as Record<string, unknown>;
        event.products[idx] = {
          ...event.products[idx]!,
          ...body,
          ...productTextFromBody({ ...event.products[idx]!, ...body }),
          id: String(params.id),
          event_id: event.id,
          updated_at: now(),
        };
        return HttpResponse.json(event.products[idx]);
      }
    }
    return HttpResponse.json({ detail: "Product not found." }, { status: 404 });
  }),

  http.delete("/api/products/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    for (const event of events) {
      const idx = event.products.findIndex((p) => p.id === params.id);
      if (idx !== -1) {
        event.products.splice(idx, 1);
        return new HttpResponse(null, { status: 204 });
      }
    }
    return HttpResponse.json({ detail: "Product not found." }, { status: 404 });
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
    if (!body.venue_id) {
      return HttpResponse.json({ detail: "venue_id is required." }, { status: 400 });
    }
    const newTT = {
      id: uid(),
      name: String(body.name ?? ""),
      venue_id: String(body.venue_id),
      shape: String(body.shape ?? "round"),
      width_m: Number(body.width_m ?? 1),
      length_m: Number(body.length_m ?? 1),
      height_type: String(body.height_type ?? "high"),
      capacity: Number(body.capacity ?? 4),
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
    return HttpResponse.json(tablesWithRegistrationAssignments());
  }),

  http.get("/api/tables/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const table = tablesWithRegistrationAssignments().find((t) => t.id === params.id);
    if (!table) return HttpResponse.json(null, { status: 404 });
    return HttpResponse.json(table);
  }),

  http.post("/api/tables", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const tableTypeId = String(body.table_type_id ?? "");
    const tableType = tableTypes.find((candidate) => candidate.id === tableTypeId);
    const newTable = {
      id: uid(),
      name: String(body.name ?? ""),
      capacity: Number(tableType?.capacity ?? 4),
      x: Number(body.x ?? 50),
      y: Number(body.y ?? 50),
      table_type_id: tableTypeId,
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
  /** GET /api/venue-plan/:editionId — read-only plan assembled from the layout stores. */
  http.get("/api/venue-plan/:editionId", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const editionLayouts = layouts.filter((layout) => layout.edition_id === params.editionId);
    return HttpResponse.json({
      edition_id: params.editionId,
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
    return HttpResponse.json(layouts);
  }),

  http.post("/api/layouts", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newLayout = {
      id: uid(),
      edition_id: events.find((e) => e.id === body.event_id)?.edition_id ?? null,
      room_id: String(body.room_id ?? ""),
      event_id: String(body.event_id),
      date: events.find((e) => e.id === body.event_id)?.date ?? null,
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
    // The real API removes the layout's tables and areas with it.
    tables = tables.filter((table) => table.layout_id !== params.id);
    areas = areas.filter((area) => area.layout_id !== params.id);
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

  /** POST /api/push/test — admin-only test send (#941). */
  http.post("/api/push/test", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as { subscription_id: string };
    return HttpResponse.json(
      { queued: true, job_id: `mock-job-${body.subscription_id}` },
      { status: 202 },
    );
  }),
];

/** Reset all admin mutable state (useful for tests). */
export function resetAdminStore(): void {
  eventCategories.items = structuredClone(seedEventCategories);
  productCategories.items = structuredClone(seedProductCategories);
  resetSharedStore();
  resetEditionStore();
  people = structuredClone(seedPeople);
  organizations = structuredClone(seedOrganizations);
  venues = structuredClone(seedVenues);
  rooms = structuredClone(seedRooms);
  tableTypes = structuredClone(seedTableTypes);
  tables = structuredClone(seedTables);
  layouts = structuredClone(seedLayouts);
  areas = structuredClone(seedAreas);
  activeScenario = "default";
  forcedAuthScenario = "default";
}

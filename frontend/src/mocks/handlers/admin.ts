import { jsonResponse } from "../response";
import { venueOut } from "../data/builders";
import type {
  AreaOut,
  EditionAttendanceStats,
  EventCheckInStats,
  LayoutOut,
  RegistrationDashboardStats,
  RegistrationEventStats,
  RoomOut,
  TableOut,
  TableTypeOut,
  VenueOut,
} from "@/api-types";
import type { StampCard, StampCardType } from "@/lib/editions/stampCards";
import { http, HttpResponse } from "msw/http";
import { orderItemOut, registrationOut } from "../data/builders";
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
import {
  seedAuditEntries,
  seedContactMessages,
  seedEmailCategories,
  seedFaqItems,
  seedPrivacyPolicy,
  seedWaitlistEntries,
} from "../data/adminContent";
import { seedOrganizations } from "../data/organizations";
import { localIsoDate } from "@/types/person";
import { seedPeople, type MockPerson } from "../data/people";
import {
  type RegistrationScenario,
  seedTransactions,
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
let people: MockPerson[] = structuredClone(seedPeople);
let organizations: import("@/api-types").OrganizationOut[] = structuredClone(seedOrganizations);
const eventCategories = { items: structuredClone(seedEventCategories) };
const productCategories = { items: structuredClone(seedProductCategories) };
let venues: VenueOut[] = structuredClone(seedVenues);
let rooms: RoomOut[] = structuredClone(seedRooms);
let tableTypes: TableTypeOut[] = structuredClone(seedTableTypes);
let tables: TableOut[] = structuredClone(seedTables);
let layouts: LayoutOut[] = structuredClone(seedLayouts);
let areas: AreaOut[] = structuredClone(seedAreas);

let stampTypes: StampCardType[] = [];
let stampCards: StampCard[] = [];
function hasRewardDue(id: unknown) {
  return stampCards.some(
    (card) => card.person_id === id && card.reward && !card.reward.handed_out_at,
  );
}
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

/** The per-language event text of a create/update body, with `title`/`description` resolved to Dutch. */
function eventTextFromBody(body: Record<string, unknown>) {
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : null);
  const fields = {
    title_nl: text("title_nl"),
    title_fr: text("title_fr"),
    title_en: text("title_en"),
    description_nl: text("description_nl"),
    description_fr: text("description_fr"),
    description_en: text("description_en"),
  };
  return {
    ...fields,
    title: fields.title_nl ?? "",
    description: fields.description_nl ?? "",
  };
}

/** The per-language product text of a create/update body, with `name`/`description` resolved to Dutch. */
function productTextFromBody(body: Record<string, unknown>) {
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : null);
  const fields = {
    name_nl: text("name_nl"),
    name_fr: text("name_fr"),
    name_en: text("name_en"),
    description_nl: text("description_nl"),
    description_fr: text("description_fr"),
    description_en: text("description_en"),
  };
  return {
    ...fields,
    name: fields.name_nl ?? "",
    description: fields.description_nl ?? "",
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
    http.get(path, () => jsonResponse<SeedCategory[]>(store.items)),
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
      const created = {
        key,
        label_nl: (body.label_nl as string | null) ?? null,
        label_fr: (body.label_fr as string | null) ?? null,
        label_en: (body.label_en as string | null) ?? null,
        sort_order: Number(body.sort_order ?? 0),
        created_at: now(),
        updated_at: now(),
      };
      const category = { ...created, label: created.label_nl ?? key };
      store.items.push(category);
      sort();
      return jsonResponse<SeedCategory>(category, { status: 201 });
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
        label: merged.label_nl ?? merged.key,
      };
      return jsonResponse<SeedCategory>(store.items[index]!);
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
  registration: import("@/api-types").RegistrationOutWithToken,
): import("@/api-types").CheckInGuestOut {
  const person = registration.person;
  const event = registration.event;
  const table = tables.find((item) => item.id === registration.table_id);
  return {
    id: registration.id,
    name: person?.name ?? "",
    event_id: registration.event_id,
    edition_id: registration.event?.edition_id ?? null,
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
// Active in a role: not archived as a whole and not retired from that role (as the backend does).
function isActiveIn(person: MockPerson, role: string | null | undefined): boolean {
  const retired = (person.retired_roles ?? {}) as Record<string, string>;
  return !person.anonymised && !(role && Object.hasOwn(retired, role));
}
function filteredPeople(url: URL, role?: string) {
  const active = url.searchParams.get("active");
  const requestedRole = role ?? url.searchParams.get("role");
  const q = url.searchParams.get("q")?.toLowerCase().trim();
  return people.filter(
    (person) =>
      (!url.searchParams.has("reward_due") ||
        hasRewardDue(person.id) === (url.searchParams.get("reward_due") === "true")) &&
      (active === null || isActiveIn(person, requestedRole) === (active === "true")) &&
      (!requestedRole || (person.roles as string[]).includes(requestedRole)) &&
      (!q ||
        [
          "name",
          "email",
          "phone",
          "address",
          "national_register_number",
          "eid_document_number",
          "notes",
        ].some((field) =>
          String(person[field as keyof MockPerson] ?? "")
            .toLowerCase()
            .includes(q),
        ) ||
        (person.roles as string[]).some((value) => value.includes(q))),
  );
}
function retireMockRole(person: MockPerson, role: string): MockPerson {
  const retired = (person.retired_roles ?? {}) as Record<string, string>;
  return Object.hasOwn(retired, role)
    ? person
    : { ...person, retired_roles: { ...retired, [role]: localIsoDate() } };
}
function reactivateMockRole(person: MockPerson, role: string): MockPerson {
  const { [role]: _removed, ...retired } = (person.retired_roles ?? {}) as Record<string, string>;
  return { ...person, retired_roles: retired };
}
function peopleEnvelope(
  url: URL,
  role?: string,
): import("@/api-types").PersonListEnvelope & import("@/api-types").VolunteerListEnvelope {
  const rows = filteredPeople(url, role).map((person) => ({
    ...person,
    last_attended: null,
    inactivity_highlight: false,
    reward_due: hasRewardDue(person.id),
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
  http.get(
    "/api/stamp-cards/types",
    ({ request }) =>
      requireAuth(request) ?? jsonResponse<import("@/api-types").StampCardTypeOut[]>(stampTypes),
  ),
  http.post("/api/stamp-cards/types", async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const type = { ...((await request.json()) as StampCardType), id: crypto.randomUUID() };
    stampTypes.push(type);
    return jsonResponse<import("@/api-types").StampCardTypeOut>(type, { status: 201 });
  }),
  http.put("/api/stamp-cards/types/:id", async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const type = { ...((await request.json()) as StampCardType), id: String(params.id) };
    stampTypes = stampTypes.map((current) => (current.id === params.id ? type : current));
    return jsonResponse<import("@/api-types").StampCardTypeOut>(type);
  }),
  http.get("/api/stamp-cards/people/:id", ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return jsonResponse<import("@/api-types").StampCardOut[]>(
      stampCards.filter((card) => card.person_id === params.id),
    );
  }),
  http.put("/api/stamp-cards/rewards/:id", async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const body = (await request.json()) as { handed_out: boolean };
    const reward = stampCards.find((card) => card.reward?.id === params.id)?.reward;
    if (!reward) return HttpResponse.json({}, { status: 404 });
    reward.handed_out_at = body.handed_out ? new Date().toISOString() : null;
    return jsonResponse<import("@/api-types").StampRewardOut>(reward);
  }),
  // Browser tests seed card history explicitly; normal mock lists remain unchanged.
  http.post("/api/mock/stamp-cards", async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    stampCards = (await request.json()) as StampCard[];
    return HttpResponse.json({ ok: true });
  }),
  // The announcements panel mounts before the signage editor tab is selected.
  http.get("/api/announcements", ({ request }) => {
    const authError = requireAuth(request);
    return authError ?? jsonResponse<import("@/api-types").AnnouncementOut[]>([]);
  }),

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
      const person = registration.person as import("@/api-types").PersonSummaryOut | undefined;
      const event = registration.event as Record<string, unknown> | undefined;
      return [person?.name, person?.email, registration.id, registration.event_id, event?.title]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(query));
    });
    const limit = Number(url.searchParams.get("limit") ?? filtered.length) || filtered.length;
    const page = Number(url.searchParams.get("page") ?? 1) || 1;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    return jsonResponse<import("@/api-types").RegistrationListEnvelope>({
      items,
      total: filtered.length,
      limit,
      page,
    });
  }),

  http.get("/api/volunteer/registrations", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Number(url.searchParams.get("limit") ?? 10);

    const matches = sharedStore.registrations.filter((registration) => {
      if (!query) return true;
      const person = registration.person as import("@/api-types").PersonSummaryOut | undefined;
      const event = registration.event as Record<string, unknown> | undefined;
      return [person?.name, person?.email, registration.id, registration.event_id, event?.title]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(query));
    });

    return jsonResponse<import("@/api-types").CheckInGuestOut[]>(
      matches.slice(0, limit).map(registrationToCheckInResponse),
    );
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

    return jsonResponse<import("@/api-types").CheckInOut>({
      already_checked_in: alreadyCheckedIn,
      stamp_progress: null,
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
    const currentOrderItems = current.order_items;
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
    return jsonResponse<import("@/api-types").CheckInGuestOut>(
      registrationToCheckInResponse(sharedStore.registrations[idx]!),
    );
  }),

  // ──────────────────────────────────────────────────────────────
  // Registration detail / update
  // ──────────────────────────────────────────────────────────────
  http.get("/api/registrations/stats", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const params = new URL(request.url).searchParams;
    const editionId = params.get("edition_id");
    const date = params.get("event_date");
    const stats: RegistrationDashboardStats = {
      all: 0,
      pending: 0,
      confirmed: 0,
      festival: 0,
      standalone: 0,
      active: 0,
      today: 0,
      events: [],
    };
    const byEvent = new Map<string, RegistrationEventStats>();
    for (const registration of sharedStore.registrations) {
      const event = events.find(({ id }) => id === registration.event_id) ?? registration.event;
      if (!event) continue;
      const edition = editions.find(({ id }) => id === event.edition_id);
      stats.all += 1;
      if (registration.status === "confirmed" || registration.status === "pending") {
        stats[registration.status] += 1;
      }
      if (edition) stats[edition.edition_type === "festival" ? "festival" : "standalone"] += 1;
      if (editionId && event.edition_id === editionId) stats.active += 1;
      if (event.date === date) stats.today += 1;
      if (registration.status === "cancelled") continue;
      const attendance = byEvent.get(event.id) ?? {
        event_id: event.id,
        event_title: event.title,
        edition_id: event.edition_id,
        total: 0,
        checked_in: 0,
      };
      attendance.total += registration.guest_count;
      if (registration.checked_in) attendance.checked_in += registration.guest_count;
      byEvent.set(event.id, attendance);
    }
    stats.events = [...byEvent.values()];
    return jsonResponse<RegistrationDashboardStats>(stats);
  }),

  http.get("/api/registrations/:id/transactions", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    if (!sharedStore.registrations.some(({ id }) => id === params.id)) {
      return HttpResponse.json(null, { status: 404 });
    }
    return jsonResponse<import("@/api-types").PaymentTransactionOut[]>(
      seedTransactions.filter((entry) => entry.registration_id === params.id),
    );
  }),

  http.get("/api/registrations/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const reg = sharedStore.registrations.find((r) => r.id === params.id);
    if (!reg) return HttpResponse.json(null, { status: 404 });
    return jsonResponse<import("@/api-types").RegistrationOutWithToken>(reg);
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
    return jsonResponse<import("@/api-types").RegistrationOut>(registration);
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
    const requested = Array.isArray(body.order_items)
      ? (body.order_items as { product_id: string; quantity: number }[])
      : [];
    const orderItems = requested.flatMap(({ product_id, quantity }) => {
      const product = event?.products.find((candidate) => candidate.id === product_id);
      return product
        ? [
            {
              product_id: product.id,
              name: product.name,
              price: Number(product.price),
              category: product.category,
              quantity,
              included_quantity: 0,
              delivered_quantity: 0,
              delivered: false,
            },
          ]
        : [];
    });
    const requiredIds = new Set(
      (event?.products ?? []).filter((product) => product.required).map((product) => product.id),
    );
    if (
      orderItems.length > 0 &&
      requiredIds.size > 0 &&
      !orderItems.some((item) => requiredIds.has(item.product_id))
    ) {
      return HttpResponse.json(
        {
          detail: "This event requires a required product before optional products can be ordered.",
        },
        { status: 400 },
      );
    }
    if (!person || !event) {
      return HttpResponse.json(
        { detail: person ? "Event not found." : "Person not found." },
        { status: 404 },
      );
    }
    const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const newReg = registrationOut({
      id: uid(),
      person_id: String(person.id),
      person: {
        id: String(person.id),
        name: String(person.name ?? ""),
        email: String(person.email ?? ""),
        phone: String(person.phone ?? ""),
        preferred_language: null,
      },
      event_id: String(event.id),
      event,
      guest_count: Number(body.guest_count ?? 1),
      order_items: orderItems.map((item) => orderItemOut(item)),
      amount_due: orderItems.length ? total.toFixed(2) : null,
      notes: String(body.notes ?? ""),
      check_in_token: `mock-token-${uid()}`,
      created_at: now(),
      updated_at: now(),
    });
    sharedStore.registrations.push(newReg);
    return jsonResponse<import("@/api-types").RegistrationOut>(newReg, { status: 201 });
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
    const stats: EditionAttendanceStats[] = [
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
    ];
    return jsonResponse<import("@/api-types").EditionAttendanceStats[]>(stats);
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
    const active = rows.filter((row) =>
      isActiveIn(row, new URL(request.url).searchParams.get("role")),
    ).length;
    return jsonResponse<import("@/api-types").PeopleCountsOut>({
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
    return jsonResponse<import("@/api-types").PersonListEnvelope>({
      items: matching.slice((page - 1) * limit, page * limit).map((row) => ({
        ...row,
        reward_due: hasRewardDue(row.id),
        last_attended: null,
        inactivity_highlight: false,
        registration_count: sharedStore.registrations.filter((r) => r.person_id === row.id).length,
      })),
      total: matching.length,
      limit,
      page,
    } satisfies import("@/api-types").PersonListEnvelope);
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
    return jsonResponse<import("@/api-types").PersonListEnvelope>(
      peopleEnvelope(new URL(request.url)),
    );
  }),

  http.post("/api/people", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newPerson: MockPerson = {
      id: uid(),
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      roles: Array.isArray(body.roles) ? (body.roles as string[]) : [],
      national_register_number: null,
      eid_document_number: null,
      visits_per_month: null,
      notes: String(body.notes ?? ""),
      role_history: {},
      help_periods: [],
      anonymised: false,
      preferred_language: null,
      retired_roles: {},
      inactivity_exempt: false,
      inactivity_exempt_note: "",
      oidc_subject: null,
      created_at: now(),
      updated_at: now(),
    };
    people.push(newPerson);
    return jsonResponse<import("@/api-types").PersonOut>(newPerson, { status: 201 });
  }),

  http.put("/api/people/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    people[idx] = { ...people[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").PersonOut>(people[idx]);
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
    return jsonResponse<import("@/api-types").PersonOut>(canonical);
  }),

  http.get("/api/people/:id/registrations", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const personRegs = sharedStore.registrations.filter((r) => r.person_id === params.id);
    return jsonResponse<import("@/api-types").RegistrationOut[]>(personRegs);
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
    const newMember: MockPerson = {
      id: uid(),
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      roles: ["member"],
      national_register_number: null,
      eid_document_number: null,
      visits_per_month: typeof body.visits_per_month === "number" ? body.visits_per_month : null,
      notes: String(body.notes ?? ""),
      help_periods: [],
      anonymised: false,
      preferred_language: null,
      retired_roles: {},
      inactivity_exempt: false,
      inactivity_exempt_note: "",
      oidc_subject: null,
      role_history: {
        member: [
          {
            started_on: typeof body.member_since === "string" ? body.member_since : localIsoDate(),
            ended_on: null,
          },
        ],
      },
      created_at: now(),
      updated_at: now(),
    };
    people.push(newMember);
    return jsonResponse<import("@/api-types").PersonOut>(newMember, { status: 201 });
  }),

  http.put("/api/members/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const { member_since: memberSince, ...body } = (await request.json()) as Record<
      string,
      unknown
    >;
    const current = people[idx]!;
    const history = (current.role_history ?? {}) as MockPerson["role_history"];
    const stretches = history.member ?? [{ started_on: null, ended_on: null }];
    people[idx] = {
      ...current,
      ...body,
      ...(typeof memberSince === "string"
        ? {
            role_history: {
              ...history,
              member: [
                ...stretches.slice(0, -1),
                { ended_on: stretches.at(-1)?.ended_on ?? null, started_on: memberSince },
              ],
            },
          }
        : {}),
      id: String(params.id),
      updated_at: now(),
    };
    return jsonResponse<import("@/api-types").PersonOut>(people[idx]);
  }),

  // Ending a membership retires the member role; the role and the person stay.
  http.post("/api/members/:id/deactivate", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    people[idx] = retireMockRole(people[idx]!, "member");
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/members/:id/reactivate", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    people[idx] = reactivateMockRole(people[idx]!, "member");
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
    return jsonResponse<import("@/api-types").VolunteerListEnvelope>(
      peopleEnvelope(new URL(request.url), "volunteer"),
    );
  }),

  http.post("/api/volunteers", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newVol: MockPerson = {
      id: uid(),
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      roles: ["volunteer"],
      national_register_number:
        typeof body.national_register_number === "string" ? body.national_register_number : null,
      eid_document_number:
        typeof body.eid_document_number === "string" ? body.eid_document_number : null,
      help_periods: Array.isArray(body.help_periods)
        ? (body.help_periods as import("@/api-types").VolunteerHelpPeriodIn[]).map(
            (period, index) => ({
              ...period,
              last_help_day: period.last_help_day ?? null,
              notes: period.notes ?? "",
              id: index + 1,
            }),
          )
        : [],
      visits_per_month: null,
      notes: String(body.notes ?? ""),
      role_history: {},
      anonymised: false,
      preferred_language: null,
      retired_roles: {},
      inactivity_exempt: false,
      inactivity_exempt_note: "",
      oidc_subject: null,
      created_at: now(),
      updated_at: now(),
    };
    people.push(newVol);
    return jsonResponse<import("@/api-types").VolunteerOut>(newVol, { status: 201 });
  }),

  http.put("/api/volunteers/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    people[idx] = { ...people[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").VolunteerOut>(people[idx]);
  }),

  // Ending volunteering retires the role and keeps every period; open periods are closed (today).
  http.post("/api/volunteers/:id/deactivate", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const today = localIsoDate();
    const help_periods = (people[idx]!.help_periods ??
      []) as import("@/api-types").VolunteerPeriodOut[];
    people[idx] = {
      ...retireMockRole(people[idx]!, "volunteer"),
      help_periods: help_periods.map((period) =>
        period.last_help_day === null
          ? {
              ...period,
              last_help_day: today > String(period.first_help_day) ? today : period.first_help_day,
            }
          : period,
      ),
    };
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/volunteers/:id/reactivate", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = people.findIndex((p) => p.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    people[idx] = reactivateMockRole(people[idx]!, "volunteer");
    return new HttpResponse(null, { status: 204 });
  }),

  // ──────────────────────────────────────────────────────────────
  // Organizations
  // ──────────────────────────────────────────────────────────────
  http.get("/api/me/organizations", ({ request }) => {
    // Same verified contact as the changes handler below; other sessions manage nothing.
    if (forcedAuthScenario !== "default" || parseBearerToken(request) !== "mock-manager-token") {
      return jsonResponse<import("@/api-types").ManagedOrganizationOut[]>([]);
    }
    return jsonResponse<import("@/api-types").ManagedOrganizationOut[]>(
      organizations.filter((row) => row.contact_person_id === "person-01"),
    );
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
    return jsonResponse<import("@/api-types").OrganizationChangeOut[]>([]);
  }),

  http.get("/api/organizations/translation", ({ request }) => {
    const error = requireAuth(request);
    return error ?? jsonResponse<import("@/api-types").TranslationCapabilities>({ languages: [] });
  }),
  http.get("/api/me/organizations/:id/translation", () =>
    jsonResponse<import("@/api-types").TranslationCapabilities>({ languages: [] }),
  ),

  http.get("/api/organizations/changes", ({ request }) => {
    const error = requireAuth(request);
    return error ?? jsonResponse<import("@/api-types").OrganizationChangeOut[]>([]);
  }),

  http.get("/api/organizations", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    return jsonResponse<import("@/api-types").OrganizationOut[]>(organizations);
  }),

  http.get("/api/organizations/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const id = Number(params.id);
    const organization = organizations.find((e) => e.id === id);
    if (!organization) return HttpResponse.json(null, { status: 404 });
    return jsonResponse<import("@/api-types").OrganizationOut>(organization);
  }),

  http.post("/api/organizations", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const maxId = organizations.reduce((max, e) => Math.max(max, Number(e.id) || 0), 0);
    const newOrganization: import("@/api-types").OrganizationOut = {
      description_nl: typeof body.description_nl === "string" ? body.description_nl : null,
      description_fr: typeof body.description_fr === "string" ? body.description_fr : null,
      description_en: typeof body.description_en === "string" ? body.description_en : null,
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
    return jsonResponse<import("@/api-types").OrganizationOut>(newOrganization, { status: 201 });
  }),

  http.put("/api/organizations/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const id = Number(params.id);
    const idx = organizations.findIndex((e) => e.id === id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    organizations[idx] = { ...organizations[idx]!, ...body, id, updated_at: now() };
    return jsonResponse<import("@/api-types").OrganizationOut>(organizations[idx]);
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
    return jsonResponse<import("@/api-types").EditionOut>(edition);
  }),

  http.post("/api/editions", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const newEdition: SeedEdition = {
      organizations: [],
      co_organizer: null,
      flyer_image: null,
      hero_image: null,
      share_image: null,
      id: uid(),
      year: Number(body.year ?? new Date().getFullYear()),
      month: String(body.month ?? "march"),
      edition_type:
        body.edition_type === "bourse" || body.edition_type === "capsule_exchange"
          ? body.edition_type
          : "festival",
      dates: Array.isArray(body.dates) ? (body.dates as string[]) : [],
      venue: venues.find((v) => v.id === body.venue_id) ?? venueOut(),
      events: [],
      producers: [],
      sponsors: [],
      vendors: [],
      active: body.active === true,
      created_at: now(),
      updated_at: now(),
    };
    editions.push(newEdition);
    return jsonResponse<import("@/api-types").EditionOut>(newEdition, { status: 201 });
  }),

  http.put("/api/editions/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = editions.findIndex((e) => e.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    editions[idx] = { ...editions[idx]!, ...body, id: String(params.id), updated_at: now() };
    return jsonResponse<import("@/api-types").EditionOut>(editions[idx]);
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

    const stats: EventCheckInStats[] = [...totals.entries()].map(([event_id, entry]) => ({
      event_id,
      event_title: events.find((event) => event.id === event_id)?.title ?? event_id,
      ...entry,
    }));
    return jsonResponse<import("@/api-types").EventCheckInStats[]>(stats);
  }),

  ...categoryHandlers("event", "/api/event-categories", eventCategories, (key) =>
    events.some((event) => event.category === key),
  ),
  ...categoryHandlers("product", "/api/product-categories", productCategories, (key) =>
    events.some((event) => event.products.some((product) => product.category === key)),
  ),

  http.get("/api/events/translation", ({ request }) => {
    const error = requireAuth(request);
    return error ?? jsonResponse<import("@/api-types").TranslationCapabilities>({ languages: [] });
  }),
  http.get("/api/events/:id", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const event = events.find((e) => e.id === params.id);
    if (!event) return HttpResponse.json(null, { status: 404 });
    return jsonResponse<import("@/api-types").EventOut>(event);
  }),

  http.post("/api/events", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const edition = editions.find((e) => e.id === body.edition_id);
    const newEvent: SeedEvent = {
      volunteers_only: body.volunteers_only === true,
      members_only: body.members_only === true,
      registrations_close_at:
        typeof body.registrations_close_at === "string" ? body.registrations_close_at : null,
      order_questions: [],
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
    events.push(newEvent);
    return jsonResponse<import("@/api-types").EventOut>(newEvent, { status: 201 });
  }),

  http.put("/api/events/:id", async ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const idx = events.findIndex((e) => e.id === params.id);
    if (idx === -1) return HttpResponse.json(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    const merged = { ...events[idx]!, ...body, id: String(params.id), updated_at: now() };
    events[idx] = { ...merged, ...eventTextFromBody(merged) };
    return jsonResponse<import("@/api-types").EventOut>(events[idx]);
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
    return jsonResponse<import("@/api-types").ProductOut[]>(
      eventId ? all.filter((p) => p.event_id === eventId) : all,
    );
  }),

  http.post("/api/products", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as Record<string, unknown>;
    const event = events.find((e) => e.id === body.event_id);
    if (!event) return HttpResponse.json({ detail: "Event not found." }, { status: 404 });
    const newProduct: SeedProduct = {
      unit: body.unit === "table" || body.unit === "person" ? body.unit : "item",
      stock: typeof body.stock === "number" ? body.stock : null,
      reserved_quantity: 0,
      available_quantity: null,
      shortage: 0,
      sold_out: false,
      id: uid(),
      event_id: String(body.event_id ?? ""),
      ...productTextFromBody(body),
      price: Number(body.price ?? 0).toFixed(2),
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
    return jsonResponse<import("@/api-types").ProductOut>(newProduct, { status: 201 });
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
          price:
            body.price !== undefined ? Number(body.price).toFixed(2) : event.products[idx]!.price,
          updated_at: now(),
        };
        return jsonResponse<import("@/api-types").ProductOut>(event.products[idx]);
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

  /** POST /api/push/test — admin-only test send (#941). */
  /** Read-only queue and content screens: seeded lists so the admin sweep renders real states. */
  http.get(
    "/api/waitlist",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").WaitlistEntryListEnvelope>({
        items: seedWaitlistEntries,
        total: seedWaitlistEntries.length,
        limit: 50,
        page: 1,
      }),
  ),
  http.get(
    "/api/waitlist/scopes",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").WaitlistScopes>({
        events: [{ id: "event-1", title: "Champagne dinner", outstanding: 1, total: 1 }],
        products: [
          {
            id: "product-1",
            name: "Tasting menu",
            event_id: "event-1",
            event_title: "Champagne dinner",
            outstanding: 1,
            total: 1,
          },
        ],
      }),
  ),
  http.get(
    "/api/contact",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").ContactMessageListEnvelope>({
        items: seedContactMessages,
        total: seedContactMessages.length,
        limit: 50,
        page: 1,
      }),
  ),
  http.get(
    "/api/editions/:id/scratchpad",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").EditionScratchpadOut>({
        content: "",
        updated_at: "2026-01-01T00:00:00Z",
      }),
  ),
  http.get(
    "/api/faq",
    ({ request }) =>
      requireAuth(request) ?? jsonResponse<import("@/api-types").FaqItemOut[]>(seedFaqItems),
  ),
  http.get(
    "/api/email-categories",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").EmailCategoryOut[]>(seedEmailCategories),
  ),
  http.get(
    "/api/policies/:key",
    ({ request }) =>
      requireAuth(request) ?? jsonResponse<import("@/api-types").PolicyOut>(seedPrivacyPolicy),
  ),
  http.get(
    "/api/audit/resource-types",
    ({ request }) => requireAuth(request) ?? jsonResponse<string[]>(["event", "registration"]),
  ),
  http.get(
    "/api/audit",
    ({ request }) =>
      requireAuth(request) ?? jsonResponse<import("@/api-types").AuditEntryOut[]>(seedAuditEntries),
  ),
  http.post("/api/push/test", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as { subscription_id: string };
    return jsonResponse<import("@/api-types").PushTestQueuedOut>(
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
  stampTypes = [];
  stampCards = [];
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

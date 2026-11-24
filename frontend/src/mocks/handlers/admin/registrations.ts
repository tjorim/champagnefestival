import { jsonResponse } from "../../response";
import type { RegistrationDashboardStats, RegistrationEventStats } from "@/api-types";
import { http, HttpResponse } from "msw/http";
import { orderItemOut, registrationOut } from "../../data/builders";
import { editions, events } from "../../data/editionStore";
import { seedTransactions, sharedStore } from "../../data/registrations";
import { people, tables, uid, now } from "./state";
import { requireAuth } from "./auth";

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

export const registrationHandlers = [
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
    const items = filtered.slice(start, start + limit).map((registration) => ({
      ...registration,
      table_names: (registration.allocations ?? []).flatMap((allocation) => {
        const table = tables.find((item) => item.id === allocation.table_id);
        return table ? [table.name] : [];
      }),
    }));
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
];

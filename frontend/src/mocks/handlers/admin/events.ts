import { jsonResponse } from "../../response";
import type { EventCheckInStats } from "@/api-types";
import { http, HttpResponse } from "msw/http";
import { editions, events, type SeedEvent } from "../../data/editionStore";
import { type SeedCategory } from "../../data/categories";
import { sharedStore } from "../../data/registrations";
import { eventCategories, productCategories, uid, now } from "./state";
import { requireAuth } from "./auth";

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

export const eventHandlers = [
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
];

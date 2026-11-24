import { jsonResponse } from "../../response";
import { http, HttpResponse } from "msw/http";
import { events, type SeedProduct, type SeedProductInclusion } from "../../data/editionStore";
import { uid, now } from "./state";
import { requireAuth } from "./auth";

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

export const productHandlers = [
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
      inclusions: Array.isArray(body.inclusions) ? (body.inclusions as SeedProductInclusion[]) : [],
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
];

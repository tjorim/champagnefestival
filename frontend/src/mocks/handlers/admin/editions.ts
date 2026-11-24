import { jsonResponse } from "../../response";
import { venueOut } from "../../data/builders";
import { http, HttpResponse } from "msw/http";
import { editions, type SeedEdition } from "../../data/editionStore";
import { venues, uid, now } from "./state";
import { requireAuth } from "./auth";

export const editionHandlers = [
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
    const body = (await request.json()) as Partial<import("@/api-types").EditionCreate>;
    const newEdition: SeedEdition = {
      organizations: [],
      co_organizer: null,
      flyer_image: null,
      hero_image: null,
      share_image: null,
      id: uid(),
      year: Number(body.year ?? new Date().getFullYear()),
      month: body.month ?? "march",
      edition_type: body.edition_type ?? "festival",
      dates: [],
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
];

import { jsonResponse } from "../../response";
import { http, HttpResponse } from "msw/http";
import { organizations, now } from "./state";
import { authError, requireAuth, parseBearerToken, forcedAuthScenario } from "./auth";

export const organizationHandlers = [
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
      type: body.type === "producer" || body.type === "sponsor" ? body.type : "vendor",
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
];

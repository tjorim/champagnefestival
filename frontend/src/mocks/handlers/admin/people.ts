import { jsonResponse } from "../../response";
import { http, HttpResponse } from "msw/http";
import { type MockPerson } from "../../data/people";
import { sharedStore } from "../../data/registrations";
import { people, uid, now, setPeople } from "./state";
import { requireAuth } from "./auth";
import { filteredPeople, hasRewardDue, isActiveIn, peopleEnvelope } from "./peopleHelpers";

export const peopleHandlers = [
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
    setPeople(people.filter((p) => p.id !== params.duplicateId));
    return jsonResponse<import("@/api-types").PersonOut>(canonical);
  }),

  http.get("/api/people/:id/registrations", ({ request, params }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const personRegs = sharedStore.registrations.filter((r) => r.person_id === params.id);
    return jsonResponse<import("@/api-types").RegistrationOut[]>(personRegs);
  }),
];

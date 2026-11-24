import { jsonResponse } from "../../response";
import { http, HttpResponse } from "msw/http";
import { localIsoDate } from "@/types/person";
import { type MockPerson } from "../../data/people";
import { people, uid, now } from "./state";
import { requireAuth } from "./auth";
import {
  filteredPeople,
  peopleEnvelope,
  reactivateMockRole,
  retireMockRole,
} from "./peopleHelpers";

export const volunteerHandlers = [
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
];

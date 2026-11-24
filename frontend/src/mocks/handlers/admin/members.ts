import { jsonResponse } from "../../response";
import { http, HttpResponse } from "msw/http";
import { localIsoDate } from "@/types/person";
import { type MockPerson } from "../../data/people";
import { people, uid, now } from "./state";
import { requireAuth } from "./auth";
import { retireMockRole, reactivateMockRole } from "./peopleHelpers";

export const memberHandlers = [
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
];

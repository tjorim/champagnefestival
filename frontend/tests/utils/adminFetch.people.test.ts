import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { fetchPeople, fetchPeopleSearch, fetchVolunteer } from "@/utils/adminFetch";
import { server } from "@/mocks/server";

const authHeaders = () => ({ Authorization: "Bearer test-token" });

function personPayload(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Person ${id}`,
    email: `${id}@example.com`,
    phone: "",
    address: "",
    roles: [],
    national_register_number: null,
    eid_document_number: null,
    visits_per_month: null,
    club_name: "",
    notes: "",
    active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("fetchPeople / fetchPeopleSearch — envelope handling", () => {
  it("fetchPeople merges the people and volunteers envelopes into one list", async () => {
    server.use(
      http.get("/api/people", () =>
        HttpResponse.json({
          items: [personPayload("p1")],
          total: 1,
          limit: 1000,
          page: 1,
        }),
      ),
      http.get("/api/volunteers", () =>
        HttpResponse.json({
          items: [personPayload("v1", { roles: ["volunteer"] })],
          total: 1,
          limit: 1000,
          page: 1,
        }),
      ),
    );

    const people = await fetchPeople(authHeaders);
    expect(people.map((p) => p.id).sort()).toEqual(["p1", "v1"]);
  });

  it("fetchPeopleSearch merges the searched people envelope with the volunteers envelope", async () => {
    server.use(
      http.get("/api/people", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q");
        expect(q).toBe("anne");
        return HttpResponse.json({
          items: [personPayload("p2", { name: "Anne" })],
          total: 1,
          limit: 1000,
          page: 1,
        });
      }),
      http.get("/api/volunteers", () =>
        HttpResponse.json({ items: [], total: 0, limit: 1000, page: 1 }),
      ),
    );

    const people = await fetchPeopleSearch(authHeaders, "anne");
    expect(people.map((p) => p.id)).toEqual(["p2"]);
  });

  it("fetchPeople keeps a member outside the first people page and deduplicates by id", async () => {
    const requested: string[] = [];
    server.use(
      http.get("/api/people", ({ request }) => {
        const url = new URL(request.url);
        requested.push(url.search);
        const membersOnly = url.searchParams.get("role") === "member";
        // 2 people in total, but the unfiltered page only holds the first one.
        const items = membersOnly
          ? [personPayload("p1", { roles: ["member"] }), personPayload("m2", { roles: ["member"] })]
          : [personPayload("p1", { roles: ["member"] })];
        return HttpResponse.json({ items, total: items.length, limit: 1000, page: 1 });
      }),
      http.get("/api/volunteers", () =>
        HttpResponse.json({ items: [], total: 0, limit: 1000, page: 1 }),
      ),
    );

    const people = await fetchPeople(authHeaders);

    expect(people.map((p) => p.id).sort()).toEqual(["m2", "p1"]);
    expect(requested).toContain("?role=member&limit=1000");
  });

  it("fetchVolunteer returns one volunteer with their help periods", async () => {
    server.use(
      http.get("/api/volunteers/:id", ({ params }) =>
        HttpResponse.json({
          ...personPayload(String(params.id), { roles: ["volunteer"] }),
          help_periods: [{ id: 4, first_help_day: "2026-10-10", last_help_day: null, notes: "" }],
        }),
      ),
    );

    const volunteer = await fetchVolunteer("v1", authHeaders);

    expect(volunteer.id).toBe("v1");
    expect(volunteer.helpPeriods).toEqual([
      { id: 4, firstHelpDay: "2026-10-10", lastHelpDay: null, notes: "" },
    ]);
  });

  it("fetchPeople rejects a bare-array (pre-envelope) response instead of silently returning it", async () => {
    // A bare array is exactly the pre-#931-fix shape: if this were accepted,
    // a malformed or reverted backend response would look like an empty or
    // truncated list instead of a loud failure.
    server.use(
      http.get("/api/people", () => HttpResponse.json([personPayload("m1")])),
      http.get("/api/volunteers", () =>
        HttpResponse.json({ items: [], total: 0, limit: 1000, page: 1 }),
      ),
    );

    await expect(fetchPeople(authHeaders)).rejects.toThrow(
      /expected \{items, total, limit, page\}/,
    );
  });

  it("fetchPeople rejects a malformed envelope missing total/limit/page", async () => {
    server.use(
      http.get("/api/people", () => HttpResponse.json({ items: [personPayload("p3")] })),
      http.get("/api/volunteers", () =>
        HttpResponse.json({ items: [], total: 0, limit: 1000, page: 1 }),
      ),
    );

    await expect(fetchPeople(authHeaders)).rejects.toThrow(
      /expected \{items, total, limit, page\}/,
    );
  });
});

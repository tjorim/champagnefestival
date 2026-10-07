import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { fetchVolunteer } from "@/utils/adminFetch";
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

describe("bounded volunteer detail", () => {
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
});

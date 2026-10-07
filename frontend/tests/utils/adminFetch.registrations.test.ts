import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { seedRegistrations } from "@/mocks/data/registrations";
import { server } from "@/mocks/server";
import { fetchAllRegistrationPages, fetchAllRegistrations } from "@/utils/adminFetch";

const authHeaders = () => ({ Authorization: "Bearer test-token" });

function registrationPayload(id: string) {
  return { ...seedRegistrations[0]!, id };
}

/** Serves `total` registrations through the real envelope, one requested page at a time. */
function serveRegistrations(total: number, requested: string[] = []) {
  server.use(
    http.get("/api/registrations", ({ request }) => {
      const url = new URL(request.url);
      requested.push(url.search);
      const limit = Number(url.searchParams.get("limit"));
      const page = Number(url.searchParams.get("page"));
      const first = (page - 1) * limit;
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - first)) }, (_, i) =>
        registrationPayload(`reg-${first + i}`),
      );
      return HttpResponse.json({ items, total, limit, page });
    }),
  );
}

describe("fetchAllRegistrations — reads every page", () => {
  it("returns every registration however many there are", async () => {
    const requested: string[] = [];
    serveRegistrations(2500, requested);

    const registrations = await fetchAllRegistrations(authHeaders, "march-2026");

    expect(registrations).toHaveLength(2500);
    expect(new Set(registrations.map((r) => r.id)).size).toBe(2500);
    expect(requested.sort()).toEqual([
      "?edition_id=march-2026&limit=1000&page=1",
      "?edition_id=march-2026&limit=1000&page=2",
      "?edition_id=march-2026&limit=1000&page=3",
    ]);
  });

  it("makes a single request when everything fits on one page", async () => {
    const requested: string[] = [];
    serveRegistrations(3, requested);

    const registrations = await fetchAllRegistrations(authHeaders, "march-2026");

    expect(registrations).toHaveLength(3);
    expect(requested).toEqual(["?edition_id=march-2026&limit=1000&page=1"]);
  });

  it("returns an empty list for no registrations", async () => {
    serveRegistrations(0);

    await expect(fetchAllRegistrations(authHeaders, "march-2026")).resolves.toEqual([]);
  });

  it("applies the filters to every page", async () => {
    const requested: string[] = [];
    serveRegistrations(1500, requested);

    const registrations = await fetchAllRegistrationPages(authHeaders, { status: "confirmed" });

    expect(registrations).toHaveLength(1500);
    expect(requested.sort()).toEqual([
      "?status=confirmed&limit=1000&page=1",
      "?status=confirmed&limit=1000&page=2",
    ]);
  });

  it("deduplicates a registration that shifts between pages", async () => {
    server.use(
      http.get("/api/registrations", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"));
        // A row added mid-read shifts the next page by one, so reg-999 shows up twice.
        const items =
          page === 1
            ? Array.from({ length: 1000 }, (_, i) => registrationPayload(`reg-${i}`))
            : [registrationPayload("reg-999"), registrationPayload("reg-1000")];
        return HttpResponse.json({ items, total: 1001, limit: 1000, page });
      }),
    );

    await expect(fetchAllRegistrations(authHeaders, "march-2026")).resolves.toHaveLength(1001);
  });

  it("rejects a bare-array (pre-envelope) response instead of silently returning it", async () => {
    server.use(http.get("/api/registrations", () => HttpResponse.json([registrationPayload("x")])));

    await expect(fetchAllRegistrations(authHeaders, "march-2026")).rejects.toThrow(
      /expected \{items, total, limit, page\}/,
    );
  });
});

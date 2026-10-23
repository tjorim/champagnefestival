/**
 * The public site and the admin dashboard resolve different "active" editions.
 *
 * The public site is a festival site — its countdown, marquees and structured
 * data must never latch onto a bourse — so it stays pinned to `edition_type=festival`.
 * The admin dashboard runs whichever edition is next, whatever its type, so
 * floor plans and the event-day views work for a bourse too.
 */

import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import { activeEditionQueryOptions, fetchActiveEdition } from "@/hooks/useActiveEdition";
import { server } from "@/mocks/server";
import { queryKeys } from "@/utils/queryKeys";

const EDITION = {
  id: "bourse-2026",
  year: 2026,
  edition_type: "bourse",
  month: "november",
  dates: ["2026-11-21"],
  venue: {
    name: "MEC Staf Versluys",
    address: "Kapelstraat 76",
    city: "Bredene",
    postal_code: "8450",
    country: "Belgium",
    lat: 51.23,
    lng: 2.97,
  },
  events: [],
  producers: [],
  sponsors: [],
};

/** Serves the active edition and returns the path and query of each request it receives. */
function serveActiveEdition() {
  const requested: string[] = [];
  server.use(
    http.get("/api/editions/active", ({ request }) => {
      const url = new URL(request.url);
      requested.push(url.pathname + url.search);
      return HttpResponse.json(EDITION);
    }),
  );
  return requested;
}

describe("fetchActiveEdition", () => {
  it("pins the public scope to festivals", async () => {
    const requested = serveActiveEdition();

    await fetchActiveEdition();

    expect(requested).toEqual(["/api/editions/active?edition_type=festival"]);
  });

  it("does not filter by type for the admin scope", async () => {
    const requested = serveActiveEdition();

    await fetchActiveEdition("any");

    expect(requested).toEqual(["/api/editions/active"]);
  });

  it("carries the edition type through, so admin views can label a bourse", async () => {
    serveActiveEdition();

    const edition = await fetchActiveEdition("any");

    expect(edition.editionType).toBe("bourse");
    expect(edition.id).toBe("bourse-2026");
  });
});

describe("activeEditionQueryOptions", () => {
  it("uses separate cache keys per scope", () => {
    // Sharing one entry would let the admin's any-type edition overwrite the
    // festival the public site renders, and vice versa.
    expect(activeEditionQueryOptions().queryKey).toEqual(queryKeys.activeEdition);
    expect(activeEditionQueryOptions("any").queryKey).toEqual(queryKeys.admin.activeEdition);
    expect(activeEditionQueryOptions().queryKey).not.toEqual(
      activeEditionQueryOptions("any").queryKey,
    );
  });
});

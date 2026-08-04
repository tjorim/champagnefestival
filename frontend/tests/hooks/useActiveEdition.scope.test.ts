/**
 * The public site and the admin dashboard resolve different "active" editions.
 *
 * The public site is a festival site — its countdown, marquees and structured
 * data must never latch onto a bourse — so it stays pinned to `edition_type=festival`.
 * The admin dashboard runs whichever edition is next, whatever its type, so
 * floor plans and the event-day views work for a bourse too.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { activeEditionQueryOptions, fetchActiveEdition } from "@/hooks/useActiveEdition";
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

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(EDITION), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchActiveEdition", () => {
  it("pins the public scope to festivals", async () => {
    const fetchMock = stubFetch();

    await fetchActiveEdition();

    expect(fetchMock).toHaveBeenCalledWith("/api/editions/active?edition_type=festival");
  });

  it("does not filter by type for the admin scope", async () => {
    const fetchMock = stubFetch();

    await fetchActiveEdition("any");

    expect(fetchMock).toHaveBeenCalledWith("/api/editions/active");
  });

  it("carries the edition type through, so admin views can label a bourse", async () => {
    stubFetch();

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

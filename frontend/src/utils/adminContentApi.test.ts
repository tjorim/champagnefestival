import { afterEach, describe, expect, it, vi } from "vitest";
import { saveEdition, saveEditionEvent } from "./adminContentApi";

const authHeaders = () => ({ Authorization: "Bearer test-token" });

function mockFetchResponse(body: Record<string, unknown>) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function sentBody(fetchMock: ReturnType<typeof mockFetchResponse>): Record<string, unknown> {
  const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(options?.body as string) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saveEdition", () => {
  const basePayload = {
    id: "2026-march",
    year: 2026,
    month: "march",
    venueId: "venue-1",
    active: true,
  };

  it("sends the selected exhibitor ids for a festival edition", async () => {
    const fetchMock = mockFetchResponse({ id: "2026-march" });
    vi.stubGlobal("fetch", fetchMock);

    await saveEdition(
      { ...basePayload, editionType: "festival", exhibitorIds: [1, 2] },
      authHeaders,
      "2026-march",
    );

    const body = sentBody(fetchMock);
    expect(body.exhibitors).toEqual([1, 2]);
  });

  it.each(["bourse", "capsule_exchange"] as const)(
    "explicitly sends an empty exhibitors list when converting to %s",
    async (editionType) => {
      const fetchMock = mockFetchResponse({ id: "2026-march" });
      vi.stubGlobal("fetch", fetchMock);

      await saveEdition(
        { ...basePayload, editionType, exhibitorIds: [1, 2] },
        authHeaders,
        "2026-march",
      );

      const body = sentBody(fetchMock);
      expect(body).toHaveProperty("exhibitors");
      expect(body.exhibitors).toEqual([]);
    },
  );
});

describe("saveEditionEvent", () => {
  it("converts datetime-local registration bounds to ISO datetimes", async () => {
    const fetchMock = mockFetchResponse({ id: "event-1", products: [] });
    vi.stubGlobal("fetch", fetchMock);

    await saveEditionEvent(
      {
        editionId: "2026-march",
        formData: {
          editionId: "2026-march",
          title: "Tasting",
          description: "",
          date: "2026-03-21",
          startTime: "18:00",
          endTime: "20:00",
          category: "tasting",
          registrationRequired: true,
          registrationsOpenFrom: "2026-03-20T18:00",
          registrationsCloseAt: "2026-03-21T17:00",
          maxCapacity: "20",
          sortOrder: "",
          active: true,
        },
      },
      authHeaders,
    );

    const body = sentBody(fetchMock);
    expect(body.registrations_open_from).toBe(new Date("2026-03-20T18:00").toISOString());
    expect(body.registrations_close_at).toBe(new Date("2026-03-21T17:00").toISOString());
  });
});

describe("error handling", () => {
  function mockErrorResponse(body: string) {
    return vi.fn().mockResolvedValue(
      new Response(body, {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it("surfaces the server's detail message", async () => {
    vi.stubGlobal("fetch", mockErrorResponse(JSON.stringify({ detail: "Edition not found." })));

    await expect(
      saveEdition(
        {
          id: "2026-march",
          year: 2026,
          month: "march",
          editionType: "festival",
          venueId: "venue-1",
          active: true,
          exhibitorIds: [],
        },
        authHeaders,
        "2026-march",
      ),
    ).rejects.toThrow("Edition not found.");
  });

  it("falls back to the operation message when the error body is JSON null", async () => {
    // `null` parses successfully, so reading `.detail` off it used to throw a
    // TypeError that replaced the real failure in the admin's error alert.
    vi.stubGlobal("fetch", mockErrorResponse("null"));

    await expect(
      saveEdition(
        {
          id: "2026-march",
          year: 2026,
          month: "march",
          editionType: "festival",
          venueId: "venue-1",
          active: true,
          exhibitorIds: [],
        },
        authHeaders,
        "2026-march",
      ),
    ).rejects.toThrow("Failed to update edition");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { saveEdition } from "./adminContentApi";

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
    externalPartner: "",
    externalContactName: "",
    externalContactEmail: "",
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

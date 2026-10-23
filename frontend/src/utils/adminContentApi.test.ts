import { http, HttpResponse } from "msw/http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { saveEdition, saveEditionEvent } from "./adminContentApi";

const authHeaders = () => ({ Authorization: "Bearer test-token" });

/** Answers every API write with `body` and returns the JSON bodies it received, in order. */
function serveJson(body: Record<string, unknown>): Record<string, unknown>[] {
  const sent: Record<string, unknown>[] = [];
  server.use(
    http.all("/api/*", async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(body);
    }),
  );
  return sent;
}

afterEach(() => {
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

  it("sends the selected organization ids for a festival edition", async () => {
    const fetchMock = serveJson({ id: "2026-march" });

    await saveEdition(
      { ...basePayload, editionType: "festival", organizationIds: [1, 2] },
      authHeaders,
      "2026-march",
    );

    const body = fetchMock[0]!;
    expect(body.organizations).toEqual([1, 2]);
  });

  it("sends the lineup order and sponsor levels, and none for off-festival editions", async () => {
    const festivalFetch = serveJson({ id: "2026-march" });
    await saveEdition(
      {
        ...basePayload,
        editionType: "festival",
        organizationIds: [3, 1, 2],
        sponsorTiers: { 3: "main", 2: "supporter" },
      },
      authHeaders,
      "2026-march",
    );
    expect(festivalFetch[0]!.organizations).toEqual([3, 1, 2]);
    expect(festivalFetch[0]!.sponsor_tiers).toEqual({ 3: "main", 2: "supporter" });

    const bourseFetch = serveJson({ id: "2026-march" });
    await saveEdition(
      { ...basePayload, editionType: "bourse", organizationIds: [3], sponsorTiers: { 3: "main" } },
      authHeaders,
      "2026-march",
    );
    expect(bourseFetch[0]!.sponsor_tiers).toEqual({});
  });

  it.each(["bourse", "capsule_exchange"] as const)(
    "explicitly sends an empty organizations list when converting to %s",
    async (editionType) => {
      const fetchMock = serveJson({ id: "2026-march" });

      await saveEdition(
        { ...basePayload, editionType, organizationIds: [1, 2] },
        authHeaders,
        "2026-march",
      );

      const body = fetchMock[0]!;
      expect(body).toHaveProperty("organizations");
      expect(body.organizations).toEqual([]);
    },
  );
});

describe("saveEditionEvent", () => {
  it("converts datetime-local registration bounds to ISO datetimes", async () => {
    const fetchMock = serveJson({ id: "event-1", products: [] });

    await saveEditionEvent(
      {
        editionId: "2026-march",
        formData: {
          editionId: "2026-march",
          titleNl: "Proeverij",
          titleFr: "",
          titleEn: "",
          descriptionNl: "",
          descriptionFr: "",
          descriptionEn: "",
          date: "2026-03-21",
          startTime: "18:00",
          endTime: "20:00",
          category: "tasting",
          registrationRequired: true,
          registrationsOpenFrom: "2026-03-20T18:00",
          registrationsCloseAt: "2026-03-21T17:00",
          sortOrder: "",
          active: true,
        },
      },
      authHeaders,
    );

    const body = fetchMock[0]!;
    expect(body.registrations_open_from).toBe(new Date("2026-03-20T18:00").toISOString());
    expect(body.registrations_close_at).toBe(new Date("2026-03-21T17:00").toISOString());
  });

  it("sends the per-language text, with blank translations cleared", async () => {
    const fetchMock = serveJson({ id: "event-1", products: [] });
    const formData = {
      editionId: "2026-march",
      titleNl: "Degustatie",
      titleFr: " Dégustation ",
      titleEn: "Tasting",
      descriptionNl: "",
      descriptionFr: "",
      descriptionEn: "",
      date: "2026-03-21",
      startTime: "18:00",
      endTime: "",
      category: "tasting",
      registrationRequired: false,
      registrationsOpenFrom: "",
      registrationsCloseAt: "",
      sortOrder: "",
      active: true,
    };

    await saveEditionEvent(
      { editionId: "2026-march", editingEventId: "event-1", formData },
      authHeaders,
    );

    expect(fetchMock[0]!).toMatchObject({
      title_nl: "Degustatie",
      title_fr: "Dégustation",
      title_en: "Tasting",
      description_nl: null,
      description_fr: null,
      description_en: null,
      category: "tasting",
    });
    expect(fetchMock[0]!).not.toHaveProperty("title");
    expect(fetchMock[0]!).not.toHaveProperty("title_language");

    const withDescription = serveJson({ id: "event-1", products: [] });
    await saveEditionEvent(
      {
        editionId: "2026-march",
        formData: { ...formData, descriptionNl: "Een avond", descriptionEn: "An evening" },
      },
      authHeaders,
    );
    expect(withDescription[0]!).toMatchObject({
      description_nl: "Een avond",
      description_en: "An evening",
    });
  });
});

describe("error handling", () => {
  function serveError(body: string) {
    server.use(
      http.all(
        "/api/*",
        () =>
          new HttpResponse(body, { status: 404, headers: { "Content-Type": "application/json" } }),
      ),
    );
  }

  it("surfaces the server's detail message", async () => {
    serveError(JSON.stringify({ detail: "Edition not found." }));

    await expect(
      saveEdition(
        {
          id: "2026-march",
          year: 2026,
          month: "march",
          editionType: "festival",
          venueId: "venue-1",
          active: true,
          organizationIds: [],
        },
        authHeaders,
        "2026-march",
      ),
    ).rejects.toThrow("Edition not found.");
  });

  it("falls back to the operation message when the error body is JSON null", async () => {
    // `null` parses successfully, so reading `.detail` off it used to throw a
    // TypeError that replaced the real failure in the admin's error alert.
    serveError("null");

    await expect(
      saveEdition(
        {
          id: "2026-march",
          year: 2026,
          month: "march",
          editionType: "festival",
          venueId: "venue-1",
          active: true,
          organizationIds: [],
        },
        authHeaders,
        "2026-march",
      ),
    ).rejects.toThrow("Failed to update edition");
  });
});

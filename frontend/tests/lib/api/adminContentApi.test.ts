import { jsonResponse } from "@/mocks/response";
import type { EditionOut, EventOut } from "@/api-types";
import { editionOut, eventOut } from "@/mocks/data/builders";
import { http, HttpResponse } from "msw/http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { saveEdition, saveEditionEvent } from "@/lib/api/adminContentApi";

/** Answers every API write with `body` and returns the JSON bodies it received, in order. */
function serveJson(body: EditionOut | EventOut): Record<string, unknown>[] {
  const sent: Record<string, unknown>[] = [];
  server.use(
    http.all("/api/*", async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>);
      return jsonResponse<EditionOut | EventOut>(body);
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
    month: "march" as const,
    venueId: "venue-1",
    active: true,
  };

  it("sends the selected organization ids for a festival edition", async () => {
    const fetchMock = serveJson(editionOut({ id: "2026-march" }));

    await saveEdition(
      { ...basePayload, edition_type: "festival", organizations: [1, 2] },

      "2026-march",
    );

    const body = fetchMock[0]!;
    expect(body.organizations).toEqual([1, 2]);
  });

  it("sends the lineup order and sponsor levels, and none for off-festival editions", async () => {
    const festivalFetch = serveJson(editionOut({ id: "2026-march" }));
    await saveEdition(
      {
        ...basePayload,
        edition_type: "festival",
        organizations: [3, 1, 2],
        sponsorTiers: { 3: "main", 2: "supporter" },
      },

      "2026-march",
    );
    expect(festivalFetch[0]!.organizations).toEqual([3, 1, 2]);
    expect(festivalFetch[0]!.sponsor_tiers).toEqual({ 3: "main", 2: "supporter" });

    const bourseFetch = serveJson(editionOut({ id: "2026-march" }));
    await saveEdition(
      { ...basePayload, edition_type: "bourse", organizations: [3], sponsorTiers: { 3: "main" } },

      "2026-march",
    );
    expect(bourseFetch[0]!.sponsor_tiers).toEqual({});
  });

  it.each(["bourse", "capsule_exchange"] as const)(
    "explicitly sends an empty organizations list when converting to %s",
    async (edition_type) => {
      const fetchMock = serveJson(editionOut({ id: "2026-march" }));

      await saveEdition(
        { ...basePayload, edition_type, organizations: [1, 2] },

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
    const fetchMock = serveJson(eventOut({ id: "event-1", products: [] }));

    await saveEditionEvent({
      editionId: "2026-march",
      formData: {
        edition_id: "2026-march",
        title_nl: "Proeverij",
        title_fr: "",
        title_en: "",
        description_nl: "",
        description_fr: "",
        description_en: "",
        date: "2026-03-21",
        start_time: "18:00",
        end_time: "20:00",
        category: "tasting",
        registration_required: true,
        registrations_open_from: "2026-03-20T18:00",
        registrations_close_at: "2026-03-21T17:00",

        active: true,
      },
    });

    const body = fetchMock[0]!;
    expect(body.registrations_open_from).toBe(new Date("2026-03-20T18:00").toISOString());
    expect(body.registrations_close_at).toBe(new Date("2026-03-21T17:00").toISOString());
  });

  it("sends the per-language text, with blank translations cleared", async () => {
    const fetchMock = serveJson(eventOut({ id: "event-1", products: [] }));
    const formData = {
      edition_id: "2026-march",
      title_nl: "Degustatie",
      title_fr: " Dégustation ",
      title_en: "Tasting",
      description_nl: "",
      description_fr: "",
      description_en: "",
      date: "2026-03-21",
      start_time: "18:00",
      end_time: "",
      category: "tasting",
      registration_required: false,
      registrations_open_from: "",
      registrations_close_at: "",

      active: true,
    };

    await saveEditionEvent({ editionId: "2026-march", editingEventId: "event-1", formData });

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

    const withDescription = serveJson(eventOut({ id: "event-1", products: [] }));
    await saveEditionEvent({
      editionId: "2026-march",
      formData: { ...formData, description_nl: "Een avond", description_en: "An evening" },
    });
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
          edition_type: "festival",
          venueId: "venue-1",
          active: true,
          organizations: [],
        },

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
          edition_type: "festival",
          venueId: "venue-1",
          active: true,
          organizations: [],
        },

        "2026-march",
      ),
    ).rejects.toThrow("Failed to update edition");
  });
});

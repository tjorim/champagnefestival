import { jsonResponse } from "@/mocks/response";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw/http";

import { useActiveEdition } from "@/hooks/useActiveEdition";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const toNormalizedLocalDate = (date: Date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const apiEdition: import("@/api-types").EditionPublicOut = {
  edition_type: "festival",
  vendors: [],
  co_organizer: null,
  flyer_image: null,
  hero_image: null,
  share_image: null,
  active: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  id: "2026-march",
  year: 2026,
  month: "march",
  dates: ["2026-03-13", "2026-03-14", "2026-03-15"],
  venue: {
    id: "",
    active: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    name: "Staf Versluys",
    address: "Kapelstraat 76",
    city: "Bredene",
    postal_code: "8450",
    country: "België",
    lat: 51.25,
    lng: 2.97,
  },
  events: [
    {
      title_nl: null,
      title_fr: null,
      title_en: null,
      description_nl: null,
      description_fr: null,
      description_en: null,
      edition_id: "",
      volunteers_only: false,
      members_only: false,
      registrations_close_at: null,
      active: false,
      order_questions: [],
      products: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      id: "evt-friday",
      title: "VIP-arrangement",
      description: "Friday VIP event",
      date: "2026-03-13",
      start_time: "19:30",
      end_time: "21:30",
      category: "vip",
      registration_required: true,
      registrations_open_from: "2026-02-01T10:00:00+00:00",
    },
    {
      title_nl: null,
      title_fr: null,
      title_en: null,
      description_nl: null,
      description_fr: null,
      description_en: null,
      edition_id: "",
      volunteers_only: false,
      members_only: false,
      registrations_close_at: null,
      active: false,
      order_questions: [],
      products: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      id: "evt-saturday",
      title: "Champagneparty",
      description: "Saturday party",
      date: "2026-03-14",
      start_time: "20:00",
      end_time: null,
      category: "party",
      registration_required: false,
      registrations_open_from: null,
    },
  ],
  producers: [],
  sponsors: [],
};

describe("useActiveEdition", () => {
  it("preserves descriptions for all organization types in the public payload", async () => {
    const item = {
      website: "",
      sponsor_tier: null,
      id: 1,
      name: "Maison",
      image: "/logo.svg",
      description_nl: "Hallo",
      description_fr: "Bonjour",
      description_en: "Hello",
    };
    server.use(
      http.get("/api/editions/active", () =>
        jsonResponse<import("@/api-types").EditionPublicOut>({
          ...apiEdition,
          producers: [{ ...item, type: "producer" }],
          sponsors: [{ ...item, type: "sponsor" }],
          vendors: [{ ...item, type: "vendor" }],
        }),
      ),
    );
    const { result } = renderHook(() => useActiveEdition(), {
      wrapper: createTestQueryClientWrapper(),
    });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.edition.producers).toEqual([{ ...item, type: "producer" }]);
    expect(result.current.edition.sponsors).toEqual([{ ...item, type: "sponsor" }]);
    expect(result.current.edition.vendors).toEqual([{ ...item, type: "vendor" }]);
  });

  it("uses the API as the source of truth for edition, venue, dates, and events", async () => {
    server.use(
      http.get("/api/editions/active", () =>
        jsonResponse<import("@/api-types").EditionPublicOut>(apiEdition),
      ),
    );

    const wrapper = createTestQueryClientWrapper();
    const { result } = renderHook(() => useActiveEdition(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.hasEdition).toBe(true);
    expect(result.current.edition.id).toBe("2026-march");
    expect(result.current.edition.venue.name).toBe("Staf Versluys");
    expect(result.current.edition.dates.map(toNormalizedLocalDate)).toEqual([
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ]);

    expect(result.current.edition.events).toEqual([
      expect.objectContaining({
        id: "evt-friday",
        title: "VIP-arrangement",
        date: "2026-03-13",
        registration_required: true,
      }),
      expect.objectContaining({
        id: "evt-saturday",
        title: "Champagneparty",
        date: "2026-03-14",
        registration_required: false,
      }),
    ]);
  });

  it("deduplicates dates when the API omits dates and multiple events share one day", async () => {
    server.use(
      http.get("/api/editions/active", () =>
        HttpResponse.json(
          /* Deliberately malformed dates: exercises defensive date handling. */ {
            ...apiEdition,
            dates: null,
            events: [
              apiEdition.events[0]!,
              {
                title_nl: null,
                title_fr: null,
                title_en: null,
                description_nl: null,
                description_fr: null,
                description_en: null,
                edition_id: "",
                volunteers_only: false,
                members_only: false,
                registrations_close_at: null,
                active: false,
                order_questions: [],
                products: [],
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                id: "evt-friday-late",
                title: "Late Friday",
                description: "Second Friday event",
                date: "2026-03-13",
                start_time: "21:30",
                end_time: null,
                category: "party",
                registration_required: false,
                registrations_open_from: null,
              },
              apiEdition.events[1]!,
            ],
          },
        ),
      ),
    );

    const wrapper = createTestQueryClientWrapper();
    const { result } = renderHook(() => useActiveEdition(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.edition.dates.map(toNormalizedLocalDate)).toEqual([
      "2026-03-13",
      "2026-03-14",
    ]);
    expect(result.current.edition.events).toHaveLength(3);
  });

  it("keeps the fallback edition without flagging a load error when there's simply no active edition (404)", async () => {
    server.use(
      http.get("/api/editions/active", () =>
        HttpResponse.json(
          /* Fixture exception: error response; intentionally outside the success schema. */ null,
          { status: 404 },
        ),
      ),
    );

    const wrapper = createTestQueryClientWrapper();
    const { result } = renderHook(() => useActiveEdition(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.hasEdition).toBe(false);
    expect(result.current.hasLoadError).toBe(false);
    expect(result.current.edition.events).toEqual([]);
    expect(result.current.edition.producers).toEqual([]);
    expect(result.current.edition.sponsors).toEqual([]);
  });

  it("flags a load error when the active-edition fetch genuinely fails (e.g. 500 or network error)", async () => {
    server.use(
      http.get("/api/editions/active", () =>
        HttpResponse.json(
          /* Fixture exception: error response; intentionally outside the success schema. */ null,
          { status: 500 },
        ),
      ),
    );

    const wrapper = createTestQueryClientWrapper();
    const { result } = renderHook(() => useActiveEdition(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.hasEdition).toBe(false);
    expect(result.current.hasLoadError).toBe(true);
    expect(result.current.edition.events).toEqual([]);
  });
});

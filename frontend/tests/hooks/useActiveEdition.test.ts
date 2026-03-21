import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useActiveEdition } from "@/hooks/useActiveEdition";

const apiEdition = {
  id: "2026-march",
  year: 2026,
  month: "march",
  dates: {
    friday: "2026-03-13",
    saturday: "2026-03-14",
    sunday: "2026-03-15",
  },
  venue: {
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
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => apiEdition,
      } as Response),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the API as the source of truth for edition, venue, dates, and events", async () => {
    const { result } = renderHook(() => useActiveEdition());

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.edition.id).toBe("2026-march");
    expect(result.current.edition.venue.venueName).toBe("Staf Versluys");
    expect(result.current.edition.dates.friday.getFullYear()).toBe(2026);
    expect(result.current.edition.dates.friday.getMonth()).toBe(2);
    expect(result.current.edition.dates.friday.getDate()).toBe(13);
    expect(result.current.edition.dates.saturday.getDate()).toBe(14);
    expect(result.current.edition.dates.sunday.getDate()).toBe(15);

    expect(result.current.edition.events).toEqual([
      expect.objectContaining({
        id: "evt-friday",
        title: "VIP-arrangement",
        date: "2026-03-13",
        registrationRequired: true,
      }),
      expect.objectContaining({
        id: "evt-saturday",
        title: "Champagneparty",
        date: "2026-03-14",
        registrationRequired: false,
      }),
    ]);
  });
});

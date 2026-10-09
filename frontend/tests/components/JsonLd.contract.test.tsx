/**
 * Contract test for #992 decision 3: EventStructuredData (frontend) and
 * backend/app/services/jsonld_service.build_event_json_ld must produce the
 * same JSON-LD structure from the same fixed input —
 * docs/fixtures/jsonld-edition.json, also read by
 * backend/tests/test_jsonld_service.py.
 *
 * The frontend's own real-world render uses the viewer's local timezone
 * (Date.prototype.setHours has no "which timezone" input); there is no
 * single true instant to reproduce from a viewer's browser. This test pins
 * process.env.TZ to Europe/Brussels — the one the backend computes
 * server-side, since that's where the event happens — so the two sides are
 * comparable byte-for-byte. This does not change the app's real runtime
 * behaviour for an actual visitor's browser.
 */
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import EventStructuredData from "@/components/JsonLd";
import { getLocale } from "@/paraglide/runtime";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";
import editionFixture from "../../../docs/fixtures/jsonld-edition.json";

vi.mock("@/paraglide/messages", () => ({
  m: {
    festival_name: () => "Champagnefestival",
    welcome_subtitle: () => "Een viering van fijne champagne en gemeenschap",
  },
}));

vi.mock("@/paraglide/runtime", () => ({
  getLocale: vi.fn().mockReturnValue("nl"),
}));

beforeAll(() => {
  vi.stubEnv("TZ", "Europe/Brussels");
});

const apiEdition = {
  id: "fixture-edition",
  year: editionFixture.year,
  month: "march",
  dates: editionFixture.dates,
  venue: {
    name: editionFixture.venue.name,
    address: editionFixture.venue.address,
    city: editionFixture.venue.city,
    postal_code: editionFixture.venue.postal_code,
    country: editionFixture.venue.country,
    lat: editionFixture.venue.lat,
    lng: editionFixture.venue.lng,
  },
  events: editionFixture.events.map((event) => ({
    ...event,
    edition_id: "fixture-edition",
    title: event.title_nl,
    description: event.description_nl ?? "",
    category: "ceremony",
    registration_required: false,
    active: true,
    created_at: "",
    updated_at: "",
  })),
  producers: [],
  sponsors: [],
};

function getStructuredData(container: HTMLElement) {
  const script = container.querySelector('script[type="application/ld+json"]');
  return script ? JSON.parse(script.innerHTML) : null;
}

describe("EventStructuredData contract with the shared JSON-LD fixture", () => {
  it("matches backend/tests/test_jsonld_service.py's expected structure exactly", async () => {
    server.use(http.get("/api/editions/active", () => HttpResponse.json(apiEdition)));

    const wrapper = createTestQueryClientWrapper();
    const { container } = render(<EventStructuredData />, { wrapper });

    await vi.waitFor(() => {
      expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
    });

    expect(getStructuredData(container)).toEqual({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Champagnefestival 2027",
      startDate: "2027-03-19T16:00:00.000Z",
      endDate: "2027-03-21T22:59:59.999Z",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: "Kursaal Oostende",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Monacoplein 24",
          addressLocality: "Oostende",
          postalCode: "8400",
          addressCountry: "Belgium",
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: 51.2298,
          longitude: 2.9203,
        },
      },
      image: [`${import.meta.env.VITE_PUBLIC_URL}/images/og-image.jpg`],
      description: "Een viering van fijne champagne en gemeenschap",
      offers: {
        "@type": "Offer",
        url: import.meta.env.VITE_PUBLIC_URL,
        availability: "https://schema.org/InStock",
        priceCurrency: "EUR",
      },
      inLanguage: "nl",
      organizer: {
        "@type": "Organization",
        name: "Champagnefestival",
        url: import.meta.env.VITE_PUBLIC_URL,
      },
      subEvent: [
        {
          "@type": "Event",
          name: "Openingsreceptie",
          startDate: "2027-03-19T17:00:00.000Z",
          endDate: "2027-03-19T19:00:00.000Z",
          description: "Welkom met een glas champagne",
        },
        { "@type": "Event", name: "Brunch", startDate: "2027-03-21T10:00:00.000Z" },
      ],
    });
  });

  it("names sub-events in the visitor's language and falls back to the original", async () => {
    vi.mocked(getLocale).mockReturnValue("en");
    try {
      server.use(http.get("/api/editions/active", () => HttpResponse.json(apiEdition)));
      const { container } = render(<EventStructuredData />, {
        wrapper: createTestQueryClientWrapper(),
      });
      await vi.waitFor(() => {
        expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
      });

      const names = getStructuredData(container).subEvent.map(
        (event: { name: string }) => event.name,
      );
      expect(names).toEqual(["Opening reception", "Brunch"]);
    } finally {
      vi.mocked(getLocale).mockReturnValue("nl");
    }
  });

  it("escapes markup in event text so it cannot close the script element", async () => {
    const hostile = {
      ...apiEdition,
      events: [
        { ...apiEdition.events[1]!, title_nl: "</script><b>x</b>", title: "</script><b>x</b>" },
      ],
    };
    server.use(http.get("/api/editions/active", () => HttpResponse.json(hostile)));
    const { container } = render(<EventStructuredData />, {
      wrapper: createTestQueryClientWrapper(),
    });
    await vi.waitFor(() => {
      expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
    });

    const script = container.querySelector('script[type="application/ld+json"]')!;
    expect(script.innerHTML).not.toContain("<b>");
    expect(getStructuredData(container).subEvent[0].name).toBe("</script><b>x</b>");
  });

  it("renders nothing when the backend already rendered JSON-LD into <head> (#992)", async () => {
    const ssrScript = document.createElement("script");
    ssrScript.type = "application/ld+json";
    ssrScript.setAttribute("data-ssr-jsonld", "true");
    ssrScript.textContent = "{}";
    document.head.appendChild(ssrScript);

    try {
      server.use(http.get("/api/editions/active", () => HttpResponse.json(apiEdition)));
      const wrapper = createTestQueryClientWrapper();
      const { container } = render(<EventStructuredData />, { wrapper });

      // Give the query a chance to resolve — the component must still
      // suppress its own render even once edition data arrives.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    } finally {
      document.head.removeChild(ssrScript);
    }
  });
});

import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";

import EventStructuredData from "@/components/JsonLd";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    festival_name: () => "Champagnefestival",
    welcome_subtitle: () => "A celebration of fine champagne and community",
  },
}));

vi.mock("@/paraglide/runtime", () => ({
  getLocale: vi.fn().mockReturnValue("en"),
}));

const apiEdition = {
  id: "2026-march",
  year: 2026,
  month: "march",
  dates: ["2026-03-13", "2026-03-14", "2026-03-15"],
  venue: {
    name: "Staf Versluys",
    address: "Kapelstraat 76",
    city: "Bredene",
    postal_code: "8450",
    country: "België",
    lat: 51.25,
    lng: 2.97,
  },
  events: [],
  producers: [],
  sponsors: [],
};

function getStructuredData(container: HTMLElement) {
  const script = container.querySelector('script[type="application/ld+json"]');
  return script ? JSON.parse(script.innerHTML) : null;
}

describe("EventStructuredData", () => {
  it("renders nothing when there's no active edition", async () => {
    const handled = vi.fn();
    server.use(
      http.get("/api/editions/active", () => {
        handled();
        return HttpResponse.json(null, { status: 404 });
      }),
    );

    const wrapper = createTestQueryClientWrapper();
    const { container } = render(<EventStructuredData />, { wrapper });

    // Wait for the (failed) request to settle, and confirm no structured data was rendered.
    await vi.waitFor(() => {
      expect(handled).toHaveBeenCalled();
      expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    });
  });

  it("renders the active edition as schema.org Event data", async () => {
    server.use(http.get("/api/editions/active", () => HttpResponse.json(apiEdition)));

    const wrapper = createTestQueryClientWrapper();
    const { container } = render(<EventStructuredData />, { wrapper });

    await vi.waitFor(() => {
      expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
    });

    const data = getStructuredData(container);
    expect(data["@type"]).toBe("Event");
    expect(data.name).toBe("Champagnefestival 2026");
    expect(data.startDate).toMatch(/^2026-03-13T/);
    expect(data.endDate).toMatch(/^2026-03-15T/);
    expect(data.location.name).toBe("Staf Versluys");
    expect(data.location.address.streetAddress).toBe("Kapelstraat 76");
    expect(data.location.geo.latitude).toBe(51.25);
    expect(data.location.geo.longitude).toBe(2.97);
  });
});

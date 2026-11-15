import { jsonResponse } from "@/mocks/response";
import { describe, expect, it } from "vitest";
import { http } from "msw/http";
import { server } from "@/mocks/server";
import { editionOut, eventOut, productOut } from "@/mocks/data/builders";
import { fetchEditionEvents, fetchEditions, fetchEventProducts } from "./adminContentApi";
import { fetchRegistration } from "./adminFetch";
import { registrationOut } from "@/mocks/data/builders";
import { fetchActiveEdition } from "@/hooks/useActiveEdition";
import type { EditionPublicOut, EventPublicOut, ProductPublicOut } from "@/api-types";

const headers = () => ({ Authorization: "Bearer test" });

describe("generated event, product and edition wire shapes", () => {
  it("preserves admin money strings, nulls, stored translations and nested event fields", async () => {
    const product = productOut({ price: "12.3400", name_en: "  ", stock: 7 });
    const event = eventOut({ products: [product], end_time: null });
    const edition = editionOut({ events: [event] });
    const registration = registrationOut({ event });
    server.use(
      http.get("/api/editions", () => jsonResponse<import("@/api-types").EditionOut[]>([edition])),
      http.get("/api/events", () => jsonResponse<import("@/api-types").EventOut[]>([event])),
      http.get("/api/products", () => jsonResponse<import("@/api-types").ProductOut[]>([product])),
      http.get("/api/registrations/reg-1", () =>
        jsonResponse<import("@/api-types").RegistrationOutWithToken>(registration),
      ),
    );
    expect(await fetchEditions(headers)).toEqual([edition]);
    expect(await fetchEditionEvents(edition.id, headers)).toEqual([event]);
    expect(await fetchEventProducts(event.id, headers)).toEqual([product]);
    expect((await fetchRegistration("reg-1", headers)).event).toEqual(event);
  });

  it("reads a public event without manufacturing admin inventory or edition fields", async () => {
    const product: ProductPublicOut = {
      id: "public-product",
      name: "Bottle",
      description: "",
      name_nl: null,
      name_fr: null,
      name_en: null,
      description_nl: null,
      description_fr: null,
      description_en: null,
      price: "19.9900",
      category: "champagne",
      unit: "item",
      required: false,
      purchasable: true,
      available_quantity: null,
      sold_out: false,
      inclusions: null,
      included_product_id: null,
      included_per_guests: null,
    };
    const { edition: _edition, ...base } = eventOut();
    const event: EventPublicOut = { ...base, products: [product] };
    const { organizations: _organizations, ...baseEdition } = editionOut();
    const edition: EditionPublicOut = { ...baseEdition, dates: ["2026-03-06"], events: [event] };
    server.use(
      http.get("/api/editions/active", () =>
        jsonResponse<import("@/api-types").EditionPublicOut>(edition),
      ),
    );
    const result = await fetchActiveEdition();
    expect(result.events).toEqual([event]);
    expect(result.venue).toEqual(edition.venue);
    expect(result.events[0]?.products[0]).not.toHaveProperty("stock");
    expect(result.events[0]).not.toHaveProperty("edition");
    expect(result.dates[0]?.getDate()).toBe(6);
  });
});

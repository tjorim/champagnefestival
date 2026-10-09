import { describe, expect, it } from "vitest";
import { apiToEvent, apiToProduct, isEventCategory } from "./event";

const product = {
  id: "prod-1",
  event_id: "event-1",
  name: "Table",
  price: 50,
  category: "other",
  purchasable: true,
  required: false,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

describe("apiToProduct", () => {
  it("maps the purchasable flag", () => {
    expect(apiToProduct({ ...product, purchasable: false }).purchasable).toBe(false);
    expect(apiToProduct({ ...product, purchasable: true }).purchasable).toBe(true);
  });

  it("passes inclusion edges through unchanged", () => {
    const mapped = apiToProduct({
      ...product,
      inclusions: [{ product_id: "included", quantity: 1, per_quantity: 1, rounding: "down" }],
    });

    expect(mapped.inclusions).toEqual([
      { product_id: "included", quantity: 1, per_quantity: 1, rounding: "down" },
    ]);
  });

  it("keeps non-array inclusions as null", () => {
    expect(apiToProduct({ ...product, inclusions: "not-an-array" }).inclusions).toBeNull();
  });
});

describe("apiToEvent", () => {
  const event = {
    id: "event-1",
    edition_id: "edition-1",
    title: "Opening night",
    description: "",
    title_language: "fr",
    title_nl: null,
    title_fr: "Soirée d'ouverture",
    title_en: "Opening night",
    description_language: null,
    description_nl: null,
    description_fr: null,
    description_en: null,
    date: "2026-03-20",
    start_time: "18:00",
    category: "ceremony",
    created_at: "",
    updated_at: "",
  };

  it("maps the stored languages next to the resolved text", () => {
    expect(apiToEvent(event)).toMatchObject({
      title: "Opening night",
      titleLanguage: "fr",
      titleNl: null,
      titleFr: "Soirée d'ouverture",
      titleEn: "Opening night",
      descriptionLanguage: null,
      descriptionEn: null,
    });
  });

  it("defaults a payload without translations to a Dutch original with no translations", () => {
    const mapped = apiToEvent({ id: "e", title: "Brunch" });
    expect(mapped).toMatchObject({ title: "Brunch", titleLanguage: "nl", titleNl: null });
    expect(isEventCategory("ceremony")).toBe(true);
    expect(isEventCategory("masterclass")).toBe(false);
  });
});

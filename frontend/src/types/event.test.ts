import { describe, expect, it } from "vitest";
import { apiToProduct } from "./event";

const product = {
  id: "prod-1",
  event_id: "event-1",
  name: "Table",
  price: 50,
  category: "other",
  active: true,
  required: false,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

describe("apiToProduct", () => {
  it("defaults legacy inclusion visibility to true while retaining explicit values", () => {
    const mapped = apiToProduct({
      ...product,
      inclusions: [
        { product_id: "included-default", quantity: 1, per_quantity: 1, rounding: "down" },
        {
          product_id: "included-hidden",
          quantity: 1,
          per_quantity: 1,
          rounding: "down",
          visible: false,
        },
      ],
    });

    expect(mapped.inclusions).toEqual([
      {
        product_id: "included-default",
        quantity: 1,
        per_quantity: 1,
        rounding: "down",
        visible: true,
      },
      {
        product_id: "included-hidden",
        quantity: 1,
        per_quantity: 1,
        rounding: "down",
        visible: false,
      },
    ]);
  });

  it("keeps non-array inclusions as null", () => {
    expect(apiToProduct({ ...product, inclusions: "not-an-array" }).inclusions).toBeNull();
  });
});

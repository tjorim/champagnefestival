import { describe, expect, it } from "vitest";
import { apiToProduct } from "./event";

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

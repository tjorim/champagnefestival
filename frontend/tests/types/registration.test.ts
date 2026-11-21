import { describe, expect, it } from "vitest";
import { orderItemOut } from "@/mocks/data/builders";
import { remainingQuantity } from "@/types/registration";

// The API validates `0 <= delivered_quantity <= quantity` and fills `delivered_quantity` from the legacy
// `delivered` flag (backend/tests/test_order_delivery_model.py), so the client only subtracts.
describe("remainingQuantity", () => {
  it("is the whole quantity when nothing is delivered", () => {
    expect(remainingQuantity(orderItemOut({ quantity: 6, delivered_quantity: 0 }))).toBe(6);
  });

  it("is what is left after a partial delivery", () => {
    expect(remainingQuantity(orderItemOut({ quantity: 6, delivered_quantity: 4 }))).toBe(2);
  });

  it("is zero once everything is delivered, which is also what `delivered` says", () => {
    const item = orderItemOut({ quantity: 6, delivered_quantity: 6, delivered: true });
    expect(remainingQuantity(item)).toBe(0);
    expect(item.delivered).toBe(remainingQuantity(item) === 0);
  });
});

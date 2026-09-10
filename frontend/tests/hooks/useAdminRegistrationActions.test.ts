import { describe, expect, it } from "vitest";
import { bookingUpdatePayload } from "@/hooks/useAdminRegistrationActions";

describe("bookingUpdatePayload", () => {
  it("sends quantities, notes and the chosen table release as one absolute update", () => {
    expect(
      bookingUpdatePayload({
        guestCount: 2,
        quantities: { table: 1, unused: 0 },
        allocations: [{ tableId: "keep", guestCount: 0, exclusive: true }],
        notes: "Keep near the door",
        status: "confirmed",
      }),
    ).toEqual({
      guest_count: 2,
      order_items: [{ product_id: "table", quantity: 1 }],
      allocations: [{ table_id: "keep", guest_count: 0, exclusive: true }],
      notes: "Keep near the door",
      status: "confirmed",
      confirm_over_capacity: false,
    });
  });

  it("sends an explicit empty order when every tracked product quantity is zero", () => {
    const payload = bookingUpdatePayload({
      guestCount: 1,
      quantities: { table: 0 },
      allocations: [],
      notes: "",
      status: "pending",
    });
    expect(payload).toHaveProperty("order_items", []);
  });

  it("does not erase a manual amount due when a booking has no product quantities", () => {
    const payload = bookingUpdatePayload({
      guestCount: 1,
      quantities: {},
      allocations: [],
      notes: "",
      status: "pending",
    });
    expect(payload).not.toHaveProperty("order_items");
  });
});

import { describe, expect, it } from "vitest";
import { eventOut, orderItemOut, registrationOut } from "@/mocks/data/builders";
import { apiToRegistration } from "./registrationMapper";

describe("apiToRegistration", () => {
  it("keeps every API field as it arrived, snake_case and money as strings", () => {
    const api = registrationOut({
      guest_count: 3,
      order_items: [orderItemOut({ quantity: 2, delivered_quantity: 1 })],
      amount_due: "25.00",
      amount_paid: "10.50",
      refund_due: null,
      table_id: null,
      checked_in_at: null,
      check_in_token: "secret",
    });
    const row = apiToRegistration(api);
    expect(row).toMatchObject({
      guest_count: 3,
      amount_due: "25.00",
      amount_paid: "10.50",
      refund_due: null,
      table_id: null,
      checked_in_at: null,
      check_in_token: "secret",
      order_items: api.order_items,
      allocations: api.allocations,
      person: api.person,
    });
  });

  it("is the only place the nested event is still read into the camelCase Event", () => {
    const row = apiToRegistration(
      registrationOut({ event: eventOut({ title: "Brunch", start_time: "10:00" }) }),
    );
    expect(row.event).toMatchObject({ title: "Brunch", startTime: "10:00" });
  });
});

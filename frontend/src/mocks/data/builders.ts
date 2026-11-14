import type { EventOut, OrderItemOut, RegistrationOutWithToken } from "@/api-types";

/** A complete event as the API sends it; override what a scenario cares about. */
export function eventOut(overrides: Partial<EventOut> = {}): EventOut {
  return {
    id: "event-1",
    edition_id: "edition-1",
    title: "Tasting",
    description: "",
    title_nl: null,
    title_fr: null,
    title_en: null,
    description_nl: null,
    description_fr: null,
    description_en: null,
    date: "2026-03-06",
    start_time: "18:00",
    end_time: null,
    category: "festival",
    volunteers_only: false,
    members_only: false,
    registration_required: true,
    registrations_open_from: null,
    registrations_close_at: null,
    active: true,
    edition: null,
    order_questions: [],
    products: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** A complete order line as the API sends it. */
export function orderItemOut(overrides: Partial<OrderItemOut> = {}): OrderItemOut {
  return {
    product_id: "prod-1",
    name: "Champagne",
    name_nl: null,
    name_fr: null,
    name_en: null,
    quantity: 1,
    price: 10,
    category: "champagne",
    delivered_quantity: 0,
    delivered: false,
    included_quantity: 0,
    visible: true,
    ...overrides,
  };
}

/** A complete admin registration (with its check-in token) as the API sends it. */
export function registrationOut(
  overrides: Partial<RegistrationOutWithToken> = {},
): RegistrationOutWithToken {
  return {
    id: "reg-1",
    person_id: "person-1",
    person: {
      id: "person-1",
      name: "Guest",
      email: "guest@example.com",
      phone: "",
      preferred_language: null,
    },
    event_id: "event-1",
    event: eventOut(),
    guest_count: 1,
    order_items: [],
    order_answers: [],
    booked_table_quantity: 0,
    allocations: [],
    notes: "",
    table_id: null,
    status: "confirmed",
    payment_status: "unpaid",
    amount_due: null,
    amount_paid: "0.00",
    refund_due: null,
    checked_in: false,
    checked_in_at: null,
    strap_issued: false,
    poll_question_id: null,
    stamp_progress: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    check_in_token: "token-1",
    ...overrides,
  };
}

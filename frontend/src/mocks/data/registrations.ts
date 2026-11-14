/** Seed data for registrations. */

import type { PersonSummaryOut, RegistrationOutWithToken } from "@/api-types";
import { eventOut, orderItemOut, registrationOut } from "./builders";

function person(id: string, name: string, email: string, phone: string): PersonSummaryOut {
  return { id, name, email, phone, preferred_language: null };
}

const openingEvent = eventOut({
  id: "event-01",
  edition_id: "march-2026",
  title: "Grand Opening",
  description: "Join us for the grand opening of the Champagnefestival 2026!",
  date: "2026-03-06",
  start_time: "18:00",
  end_time: "22:00",
  category: "ceremony",
  registrations_open_from: "2026-01-01T00:00:00Z",
});

const tastingDayOne = eventOut({
  id: "event-02",
  edition_id: "march-2026",
  title: "Tasting Day 1",
  description: "Explore over 80 champagne houses in Hall 5 and Hall 6.",
  date: "2026-03-07",
  start_time: "10:00",
  end_time: "20:00",
  category: "tasting",
  registrations_open_from: "2026-01-01T00:00:00Z",
});

const tastingDayTwo = eventOut({
  id: "event-03",
  edition_id: "march-2026",
  title: "Tasting Day 2",
  description: "Second day of tastings. New masterclasses available.",
  date: "2026-03-08",
  start_time: "10:00",
  end_time: "20:00",
  category: "tasting",
  registrations_open_from: "2026-01-01T00:00:00Z",
});

export const seedRegistrations: RegistrationOutWithToken[] = [
  registrationOut({
    id: "reg-01",
    person_id: "person-01",
    person: person("person-01", "Alice Dupont", "alice@moet.com", "+32471000001"),
    event_id: "event-01",
    event: openingEvent,
    guest_count: 2,
    order_items: [
      orderItemOut({
        product_id: "prod-01",
        name: "Champagne Glass",
        quantity: 4,
        delivered_quantity: 2,
        price: 12.5,
      }),
    ],
    notes: "Anniversary celebration",
    table_id: "table-01",
    allocations: [{ table_id: "table-01", guest_count: 1, exclusive: false }],
    status: "confirmed",
    payment_status: "paid",
    check_in_token: "mock-token-reg-01",
    created_at: "2026-01-10T14:00:00Z",
    updated_at: "2026-01-10T14:00:00Z",
  }),
  registrationOut({
    id: "reg-02",
    person_id: "person-02",
    person: person("person-02", "Bernard Martin", "b.martin@bollinger.fr", "+32471000002"),
    event_id: "event-02",
    event: tastingDayOne,
    guest_count: 1,
    order_items: [
      orderItemOut({
        product_id: "prod-03",
        name: "Prestige Cuvée Flight",
        quantity: 2,
        delivered_quantity: 2,
        price: 45.0,
        delivered: true,
      }),
    ],
    table_id: "table-01",
    allocations: [{ table_id: "table-01", guest_count: 1, exclusive: false }],
    status: "confirmed",
    payment_status: "unpaid",
    checked_in: true,
    checked_in_at: "2026-03-07T10:15:00Z",
    strap_issued: true,
    check_in_token: "mock-token-reg-02",
    created_at: "2026-01-12T09:00:00Z",
    updated_at: "2026-03-07T10:15:00Z",
  }),
  registrationOut({
    id: "reg-04",
    person_id: "person-05",
    person: person("person-05", "Eva Van den Broeck", "eva.vdb@example.be", "+32471000005"),
    event_id: "event-03",
    event: tastingDayTwo,
    guest_count: 2,
    order_items: [
      orderItemOut({
        product_id: "prod-04",
        name: "Rosé Pairing Menu",
        quantity: 1,
        price: 28.0,
        category: "food",
      }),
    ],
    notes: "Table near stage preferred",
    table_id: "table-02",
    allocations: [{ table_id: "table-02", guest_count: 1, exclusive: false }],
    status: "confirmed",
    payment_status: "partial",
    check_in_token: "mock-token-reg-04",
    created_at: "2026-02-03T11:00:00Z",
    updated_at: "2026-02-03T11:00:00Z",
  }),
  registrationOut({
    id: "reg-03",
    person_id: "person-04",
    person: person("person-04", "David Leclercq", "david.leclercq@example.be", "+32471000004"),
    event_id: "event-03",
    event: tastingDayTwo,
    guest_count: 3,
    order_items: [
      orderItemOut({
        product_id: "prod-02",
        name: "Cheese Platter",
        quantity: 1,
        price: 18.0,
        category: "food",
      }),
    ],
    notes: "Birthday group\n\nWheelchair access required",
    table_id: "table-03",
    allocations: [{ table_id: "table-03", guest_count: 1, exclusive: false }],
    status: "pending",
    payment_status: "unpaid",
    check_in_token: "mock-token-reg-03",
    created_at: "2026-02-01T16:00:00Z",
    updated_at: "2026-02-01T16:00:00Z",
  }),
];

/** Shared mutable store — used by both public and admin handlers. */
export const sharedStore = {
  registrations: structuredClone(seedRegistrations) as Record<string, unknown>[],
};

export function resetSharedStore(): void {
  sharedStore.registrations = structuredClone(seedRegistrations);
}

export const registrationScenarios = {
  default: seedRegistrations,
  "event-day": [
    ...seedRegistrations.map((registration) => {
      if (registration.id === "reg-01") {
        return {
          ...registration,
          checked_in: true,
          checked_in_at: "2026-03-06T18:45:00Z",
          strap_issued: true,
          updated_at: "2026-03-06T18:45:00Z",
        };
      }

      if (registration.id === "reg-03") {
        return {
          ...registration,
          status: "confirmed",
          payment_status: "paid",
          updated_at: "2026-03-08T10:30:00Z",
        };
      }

      return registration;
    }),
  ],
} as const;

export type RegistrationScenario = keyof typeof registrationScenarios;

export function setRegistrationScenario(scenario: RegistrationScenario): void {
  sharedStore.registrations = structuredClone(registrationScenarios[scenario]) as Record<
    string,
    unknown
  >[];
}

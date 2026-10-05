import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminPersonOptions,
  fetchAdminPersonRegistrations,
  fetchPersonPaymentSummary,
  fetchRegistrableEvents,
} from "./adminRegistrationApi";

const authHeaders = () => ({ Authorization: "Bearer test-token" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchAdminPersonRegistrations", () => {
  it("maps the event title from the registration list response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "reg-1",
              event: {
                id: "event-1",
                title: "Festival Friday",
                edition: { id: "edition-2026", year: 2026, month: "march" },
              },
              guest_count: 2,
              status: "confirmed",
              payment_status: "paid",
              checked_in: false,
              created_at: "2026-08-09T10:00:00Z",
              amount_paid: "150.00",
              amount_due: "150.00",
              edition_id: "edition-2026",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchAdminPersonRegistrations("person-1", authHeaders)).resolves.toEqual([
      {
        id: "reg-1",
        eventTitle: "Festival Friday",
        guestCount: 2,
        status: "confirmed",
        paymentStatus: "paid",
        checkedIn: false,
        createdAt: "2026-08-09T10:00:00Z",
        amountPaid: 150,
        amountDue: 150,
        editionId: "edition-2026",
        editionLabel: "2026 march",
      },
    ]);
  });

  it("rejects a registration whose nested event has no title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "reg-1",
              event: { id: "event-1" },
              guest_count: 2,
              status: "confirmed",
              payment_status: "paid",
              checked_in: false,
              created_at: "2026-08-09T10:00:00Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchAdminPersonRegistrations("person-1", authHeaders)).rejects.toThrow(
      "Invalid registrations payload for person person-1.",
    );
  });
});

describe("fetchPersonPaymentSummary", () => {
  it("maps the ledger-derived totals from the person payment-summary response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            received: "160.00",
            refunded: "10.00",
            net_paid: "150.00",
            due: "150.00",
            outstanding: "0.00",
            refund_liability: "0.00",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchPersonPaymentSummary("person-1", authHeaders)).resolves.toEqual({
      received: 160,
      refunded: 10,
      netPaid: 150,
      due: 150,
      outstanding: 0,
      refundLiability: 0,
    });
  });

  it("rejects a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));

    await expect(fetchPersonPaymentSummary("person-1", authHeaders)).rejects.toThrow(
      "Failed to load payment summary: 404",
    );
  });
});

describe("fetchAdminPersonOptions", () => {
  const stubPeople = (body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

  it("maps the people in the {items, total, limit, page} envelope the API returns", async () => {
    stubPeople({
      items: [{ id: "person-1", name: "Alice", email: "alice@example.com", phone: "123" }],
      total: 1,
      limit: 200,
      page: 1,
    });

    await expect(fetchAdminPersonOptions("ali", authHeaders)).resolves.toEqual([
      {
        value: "person-1",
        label: "Alice",
        sub: "alice@example.com · 123",
        name: "Alice",
        email: "alice@example.com",
        phone: "123",
      },
    ]);
  });

  it("rejects a bare array instead of reading it as no matches", async () => {
    stubPeople([{ id: "person-1", name: "Alice", email: "", phone: "" }]);

    await expect(fetchAdminPersonOptions("ali", authHeaders)).rejects.toThrow(
      /expected \{items, total, limit, page\}/,
    );
  });
});

describe("fetchRegistrableEvents", () => {
  it("rejects a malformed response instead of reporting no events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "oops" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchRegistrableEvents(authHeaders)).rejects.toThrow(/expected an array/);
  });
});

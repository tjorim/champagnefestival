import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAdminPersonRegistrations, fetchPersonPaymentSummary } from "./adminRegistrationApi";

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

import { http, HttpResponse } from "msw/http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import {
  createAdminPerson,
  createAdminRegistration,
  fetchAdminPersonOptions,
  fetchAdminPersonRegistrations,
  fetchPersonPaymentSummary,
  fetchRegistrableEvents,
} from "./adminRegistrationApi";

const authHeaders = () => ({ Authorization: "Bearer test-token" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchAdminPersonRegistrations", () => {
  it("maps the event title from the registration list response", async () => {
    server.use(
      http.get("/api/people/person-1/registrations", () =>
        HttpResponse.json([
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
        editionLabel: "March 2026",
      },
    ]);
  });

  it("rejects a registration whose nested event has no title", async () => {
    server.use(
      http.get("/api/people/person-1/registrations", () =>
        HttpResponse.json([
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
      ),
    );

    await expect(fetchAdminPersonRegistrations("person-1", authHeaders)).rejects.toThrow(
      "Invalid registrations payload for person person-1.",
    );
  });
});

describe("fetchPersonPaymentSummary", () => {
  it("maps the ledger-derived totals from the person payment-summary response", async () => {
    server.use(
      http.get("/api/people/person-1/payment-summary", () =>
        HttpResponse.json({
          received: "160.00",
          refunded: "10.00",
          net_paid: "150.00",
          due: "150.00",
          outstanding: "0.00",
          refund_liability: "0.00",
        }),
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
    server.use(
      http.get(
        "/api/people/person-1/payment-summary",
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    await expect(fetchPersonPaymentSummary("person-1", authHeaders)).rejects.toThrow(
      "Failed to load payment summary: 404",
    );
  });
});

describe("fetchAdminPersonOptions", () => {
  const stubPeople = (body: unknown) =>
    server.use(http.get("/api/people", () => HttpResponse.json(body as never)));

  it("maps the people in the {items, total, limit, page} envelope the API returns", async () => {
    stubPeople({
      items: [
        {
          id: "person-1",
          name: "Alice",
          email: "alice@example.com",
          phone: "123",
          registration_count: 3,
        },
      ],
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
        registrationCount: 3,
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
    server.use(http.get("/api/events", () => HttpResponse.json({ detail: "oops" })));

    await expect(fetchRegistrableEvents(authHeaders)).rejects.toThrow(/expected an array/);
  });
});

describe("createAdminPerson", () => {
  it("creates the person and returns it as a selectable option", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/people", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: "person-9",
            name: "Zoë",
            email: "zoe@example.com",
            phone: "",
            registration_count: 0,
          },
          { status: 201 },
        );
      }),
    );

    await expect(
      createAdminPerson(
        { name: "Zoë", email: "zoe@example.com", phone: "", preferredLanguage: "nl" },
        authHeaders,
      ),
    ).resolves.toMatchObject({ value: "person-9", label: "Zoë", registrationCount: 0 });
    expect(body).toEqual({
      name: "Zoë",
      email: "zoe@example.com",
      phone: "",
      preferred_language: "nl",
    });
  });

  it("sends no email rather than an empty string", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/people", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p", name: "Zoë", email: "", phone: "" }, { status: 201 });
      }),
    );

    await createAdminPerson(
      { name: "Zoë", email: "", phone: "", preferredLanguage: null },
      authHeaders,
    );

    expect(body?.email).toBeNull();
  });
});

describe("createAdminRegistration", () => {
  it("sends the ordered products and the idempotency key", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/registrations/admin", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "reg-1", guest_count: 2 }, { status: 201 });
      }),
    );

    await createAdminRegistration(
      {
        personId: "person-1",
        eventId: "event-1",
        guestCount: 2,
        notes: "",
        orderItems: [{ productId: "ticket", quantity: 2 }],
        idempotencyKey: "key-1",
      },
      authHeaders,
    );

    expect(body).toMatchObject({
      order_items: [{ product_id: "ticket", quantity: 2 }],
      idempotency_key: "key-1",
      status: "confirmed",
    });
  });

  it("still sends an empty order when no products are chosen", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/registrations/admin", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "reg-1" }, { status: 201 });
      }),
    );

    await createAdminRegistration(
      { personId: "p", eventId: "e", guestCount: 1, notes: "" },
      authHeaders,
    );

    expect(body?.order_items).toEqual([]);
    expect(body).not.toHaveProperty("idempotency_key");
  });
});

import { jsonResponse } from "@/mocks/response";
import { seedPeople } from "@/mocks/data/people";
import type { PersonListItemOut, PersonOut } from "@/api-types";
import { registrationOut } from "@/mocks/data/builders";
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
  it("preserves the nested event and exact money in the registration list response", async () => {
    server.use(
      http.get("/api/people/person-1/registrations", () =>
        jsonResponse<import("@/api-types").RegistrationOut[]>([
          {
            poll_question_id: null,
            stamp_progress: null,
            order_answers: [],
            booked_table_quantity: 0,
            allocations: [],
            person_id: "",
            person: { id: "", name: "", email: "", phone: "", preferred_language: null },
            event_id: "",
            order_items: [],
            notes: "",
            table_id: null,
            refund_due: "0",
            checked_in_at: null,
            strap_issued: false,
            updated_at: "2026-01-01T00:00:00Z",
            id: "reg-1",
            event: {
              description: "",
              title_nl: null,
              title_fr: null,
              title_en: null,
              description_nl: null,
              description_fr: null,
              description_en: null,
              edition_id: "",
              date: "2026-01-01",
              start_time: "",
              end_time: null,
              category: "",
              volunteers_only: false,
              members_only: false,
              registration_required: false,
              registrations_open_from: null,
              registrations_close_at: null,
              active: false,
              order_questions: [],
              products: [],
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              id: "event-1",
              title: "Festival Friday",
              edition: {
                edition_type: "festival",
                active: false,
                id: "edition-2026",
                year: 2026,
                month: "march",
              },
            },
            guest_count: 2,
            status: "confirmed",
            payment_status: "paid",
            checked_in: false,
            created_at: "2026-08-09T10:00:00Z",
            amount_paid: "150.00",
            amount_due: "150.00",
          },
        ]),
      ),
    );

    await expect(fetchAdminPersonRegistrations("person-1", authHeaders)).resolves.toMatchObject([
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
      },
    ]);
  });

  it("rejects a registration whose nested event has no title", async () => {
    server.use(
      http.get("/api/people/person-1/registrations", () =>
        HttpResponse.json(
          /* Deliberately malformed response: exercises runtime rejection. */ [
            {
              id: "reg-1",
              event: { id: "event-1" },
              guest_count: 2,
              status: "confirmed",
              payment_status: "paid",
              checked_in: false,
              created_at: "2026-08-09T10:00:00Z",
            },
          ],
        ),
      ),
    );

    await expect(fetchAdminPersonRegistrations("person-1", authHeaders)).rejects.toThrow(
      "Invalid registrations payload for person person-1.",
    );
  });
});

describe("fetchPersonPaymentSummary", () => {
  it("preserves the ledger-derived decimal totals from the person payment-summary response", async () => {
    server.use(
      http.get("/api/people/person-1/payment-summary", () =>
        jsonResponse<import("@/api-types").PersonPaymentSummary>({
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
      received: "160.00",
      refunded: "10.00",
      net_paid: "150.00",
      due: "150.00",
      outstanding: "0.00",
      refund_liability: "0.00",
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
  it("reads generated people from the list envelope without projecting fields", async () => {
    const person: PersonListItemOut = {
      ...seedPeople[0]!,
      id: "person-1",
      name: "Alice",
      email: "alice@example.com",
      phone: "123",
      registration_count: 3,
      reward_due: false,
      last_attended: null,
      inactivity_highlight: false,
    };
    server.use(
      http.get("/api/people", () =>
        jsonResponse<import("@/api-types").PersonListEnvelope>({
          items: [person],
          total: 1,
          limit: 200,
          page: 1,
        }),
      ),
    );
    await expect(fetchAdminPersonOptions("ali", authHeaders)).resolves.toEqual([person]);
  });

  it("rejects a bare array instead of reading it as no matches", async () => {
    server.use(
      http.get("/api/people", () =>
        HttpResponse.json(
          /* Deliberately malformed response: bare array instead of the people envelope. */ [
            { id: "person-1", name: "Alice", email: "", phone: "" },
          ],
        ),
      ),
    );

    await expect(fetchAdminPersonOptions("ali", authHeaders)).rejects.toThrow(
      /expected \{items, total, limit, page\}/,
    );
  });
});

describe("fetchRegistrableEvents", () => {
  it("rejects a malformed response instead of reporting no events", async () => {
    server.use(
      http.get("/api/events", () =>
        HttpResponse.json(
          /* Fixture exception: malformed success body; exercises runtime rejection. */ {
            detail: "oops",
          },
        ),
      ),
    );

    await expect(fetchRegistrableEvents(authHeaders)).rejects.toThrow(/expected an array/);
  });
});

describe("createAdminPerson", () => {
  it("creates the person and returns it as a selectable option", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/people", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return jsonResponse<import("@/api-types").PersonOut>(
          {
            ...seedPeople[0]!,
            id: "person-9",
            name: "Zoë",
            email: "zoe@example.com",
            phone: "",
          } satisfies PersonOut,
          { status: 201 },
        );
      }),
    );

    await expect(
      createAdminPerson(
        { name: "Zoë", email: "zoe@example.com", phone: "", preferredLanguage: "nl" },
        authHeaders,
      ),
    ).resolves.toMatchObject({ id: "person-9", name: "Zoë" });
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
        return jsonResponse<import("@/api-types").PersonOut>(
          {
            preferred_language: null,
            address: "",
            roles: [],
            retired_roles: {},
            role_history: {},
            national_register_number: null,
            eid_document_number: null,
            inactivity_exempt: false,
            inactivity_exempt_note: "",
            visits_per_month: null,
            notes: "",
            anonymised: false,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            id: "p",
            name: "Zoë",
            email: "",
            phone: "",
          },
          { status: 201 },
        );
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
        return jsonResponse<import("@/api-types").RegistrationOut>(
          registrationOut({ id: "reg-1", guest_count: 2 }),
          { status: 201 },
        );
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
        return jsonResponse<import("@/api-types").RegistrationOut>(
          registrationOut({ id: "reg-1" }),
          { status: 201 },
        );
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

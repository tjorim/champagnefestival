import { orderAnswersBody, type OrderAnswer } from "@/lib/editions/orderQuestions";
import { m } from "@/paraglide/messages";
import { adminRequest } from "@/lib/api/adminApi";
import type { Event } from "@/api-types";
import type { Registration } from "@/types/registration";
import type {
  RegistrationOut,
  PersonListEnvelope,
  PersonListItemOut,
  PersonOut,
  PersonSummaryOut,
  PersonPaymentSummary,
} from "@/api-types";

export type PersonOption = PersonListItemOut | PersonOut | PersonSummaryOut;

export type EditionEvent = Event;

export interface CreateRegistrationPayload {
  orderAnswers?: OrderAnswer[];
  /** Purchased quantities per product; an empty list is a deliberate no-product booking. */
  orderItems?: { productId: string; quantity: number }[];
  personId: string;
  eventId: string;
  guestCount: number;
  notes: string;
  /** Makes a retry after a lost response return the first booking instead of booking twice. */
  idempotencyKey?: string;
}

export interface CreatePersonPayload {
  name: string;
  email: string;
  phone: string;
  preferredLanguage: "nl" | "fr" | "en" | null;
}

export type PersonRegistration = RegistrationOut;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersonRegistrationRecord(value: unknown): value is RegistrationOut {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRecord(value.event) &&
    typeof value.event.title === "string" &&
    typeof value.guest_count === "number" &&
    ["pending", "confirmed", "cancelled"].includes(String(value.status)) &&
    ["unpaid", "partial", "paid"].includes(String(value.payment_status)) &&
    typeof value.checked_in === "boolean" &&
    typeof value.created_at === "string"
  );
}

export async function fetchRegistrableEvents(): Promise<EditionEvent[]> {
  const response = await adminRequest("/api/events?registration_required=true", {});

  const data = (await response.json()) as Event[];
  // A malformed response is an error, not "no registrable events".
  if (!Array.isArray(data)) throw new Error("Invalid /api/events response: expected an array.");
  return data;
}

export async function fetchAdminPersonOptions(
  query: string,

  signal?: AbortSignal,
): Promise<PersonOption[]> {
  const response = await adminRequest(`/api/people?q=${encodeURIComponent(query)}&active=true`, {
    signal,
  });
  // GET /api/people answers with a {items, total, limit, page} envelope (see
  // backend/app/routers/people.py). A bare array or any other shape is rejected
  // instead of being read as "no matches".
  const payload = (await response.json()) as PersonListEnvelope;
  if (!Array.isArray(payload.items)) {
    throw new Error("Invalid /api/people response: expected {items, total, limit, page}.");
  }
  return payload.items;
}

/**
 * Creates a person for a booking that is being drafted. The caller selects the
 * returned person straight away, so a failed booking afterwards is retried
 * against that person instead of creating a second one.
 */
export async function createAdminPerson(payload: CreatePersonPayload): Promise<PersonOption> {
  const res = await adminRequest(
    "/api/people",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email || null,
        phone: payload.phone,
        preferred_language: payload.preferredLanguage,
      }),
    },
    m.admin_people_error_create(),
  );
  return (await res.json()) as PersonOut;
}

export async function fetchAdminPersonRegistrations(
  personId: string,

  signal?: AbortSignal,
): Promise<PersonRegistration[]> {
  const response = await adminRequest(`/api/people/${encodeURIComponent(personId)}/registrations`, {
    signal,
  });

  const raw: unknown = await response.json();
  if (!Array.isArray(raw) || !raw.every(isPersonRegistrationRecord))
    throw new Error(`Invalid registrations payload for person ${personId}.`);

  return raw;
}

export type { PersonPaymentSummary } from "@/api-types";

export async function fetchPersonPaymentSummary(
  personId: string,

  signal?: AbortSignal,
): Promise<PersonPaymentSummary> {
  const response = await adminRequest(
    `/api/people/${encodeURIComponent(personId)}/payment-summary`,
    {
      signal,
    },
  );

  return (await response.json()) as PersonPaymentSummary;
}

export async function createAdminRegistration(
  payload: CreateRegistrationPayload,
): Promise<Registration> {
  const res = await adminRequest(
    "/api/registrations/admin",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person_id: payload.personId,
        event_id: payload.eventId,
        guest_count: payload.guestCount,
        order_items: (payload.orderItems ?? []).map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
        notes: payload.notes,
        ...(payload.orderAnswers ? { order_answers: orderAnswersBody(payload.orderAnswers) } : {}),
        status: "confirmed",
        ...(payload.idempotencyKey ? { idempotency_key: payload.idempotencyKey } : {}),
      }),
    },
    m.admin_error_create_registration(),
  );

  const data = await res.json();
  return data as RegistrationOut;
}

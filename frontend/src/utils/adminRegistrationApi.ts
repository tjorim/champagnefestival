import { orderAnswersBody, type OrderAnswer } from "@/utils/orderQuestions";
import { m } from "@/paraglide/messages";
import { apiErrorFromResponse } from "@/utils/apiErrors";
import { apiToEvent, type Event } from "@/types/event";
import type { PaymentStatus, Registration, RegistrationStatus } from "@/types/registration";
import { apiToRegistration } from "@/types/registrationMapper";

export interface PersonOption {
  value: string;
  label: string;
  sub: string;
  name: string;
  email: string;
  phone: string;
  /** Existing bookings, so two people with the same name can be told apart. */
  registrationCount: number;
}

interface PersonSearchResult {
  id: string;
  name: string;
  email: string;
  phone: string;
  registration_count?: number;
}

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

export interface PersonRegistration {
  id: string;
  eventTitle: string;
  guestCount: number;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  checkedIn: boolean;
  createdAt: string;
  amountPaid: number;
  amountDue: number | null;
  editionId: string;
  editionLabel: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegistrationStatus(value: unknown): value is RegistrationStatus {
  return value === "pending" || value === "confirmed" || value === "cancelled";
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === "unpaid" || value === "partial" || value === "paid";
}

function isPersonRegistrationRecord(value: unknown): value is Record<string, unknown> & {
  id: string;
  event: { title: string; edition?: { id: string; year: number; month: string } };
  guest_count: number;
  status: RegistrationStatus;
  payment_status: PaymentStatus;
  checked_in: boolean;
  created_at: string;
  amount_paid?: number | string | null;
  amount_due?: number | string | null;
  edition_id?: string;
} {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRecord(value.event) &&
    typeof value.event.title === "string" &&
    typeof value.guest_count === "number" &&
    isRegistrationStatus(value.status) &&
    isPaymentStatus(value.payment_status) &&
    typeof value.checked_in === "boolean" &&
    typeof value.created_at === "string"
  );
}

export async function fetchRegistrableEvents(
  authHeaders: () => Record<string, string>,
): Promise<EditionEvent[]> {
  const response = await fetch("/api/events?registration_required=true", {
    headers: authHeaders(),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error(m.admin_content_edition_no_events());
    throw new Error(`Failed to load registrable events (${response.status})`);
  }

  const data = (await response.json()) as Record<string, unknown>[];
  // A malformed response is an error, not "no registrable events".
  if (!Array.isArray(data)) throw new Error("Invalid /api/events response: expected an array.");
  return data.map(apiToEvent);
}

export async function fetchAdminPersonOptions(
  query: string,
  authHeaders: () => Record<string, string>,
  signal?: AbortSignal,
): Promise<PersonOption[]> {
  const response = await fetch(`/api/people?q=${encodeURIComponent(query)}&active=true`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) throw new Error("Failed to load people");
  // GET /api/people answers with a {items, total, limit, page} envelope (see
  // backend/app/routers/people.py). A bare array or any other shape is rejected
  // instead of being read as "no matches".
  const payload = (await response.json()) as { items?: PersonSearchResult[] };
  if (!Array.isArray(payload.items)) {
    throw new Error("Invalid /api/people response: expected {items, total, limit, page}.");
  }
  return payload.items.map(personSearchResultToOption);
}

function personSearchResultToOption(person: PersonSearchResult): PersonOption {
  return {
    value: person.id,
    label: person.name,
    sub: [person.email, person.phone].filter(Boolean).join(" · "),
    name: person.name,
    email: person.email,
    phone: person.phone,
    registrationCount: person.registration_count ?? 0,
  };
}

/**
 * Creates a person for a booking that is being drafted. The caller selects the
 * returned person straight away, so a failed booking afterwards is retried
 * against that person instead of creating a second one.
 */
export async function createAdminPerson(
  payload: CreatePersonPayload,
  authHeaders: () => Record<string, string>,
): Promise<PersonOption> {
  const res = await fetch("/api/people", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone,
      preferred_language: payload.preferredLanguage,
    }),
  });
  if (!res.ok) throw await apiErrorFromResponse(res, m.admin_people_error_create());
  return personSearchResultToOption((await res.json()) as PersonSearchResult);
}

export async function fetchAdminPersonRegistrations(
  personId: string,
  authHeaders: () => Record<string, string>,
  signal?: AbortSignal,
): Promise<PersonRegistration[]> {
  const response = await fetch(`/api/people/${encodeURIComponent(personId)}/registrations`, {
    signal,
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to load registrations: ${response.status}`);

  const raw: unknown = await response.json();
  if (!Array.isArray(raw) || !raw.every(isPersonRegistrationRecord))
    throw new Error(`Invalid registrations payload for person ${personId}.`);

  return raw.map((registration) => {
    const edition = registration.event.edition;
    return {
      id: registration.id,
      eventTitle: registration.event.title,
      guestCount: registration.guest_count,
      status: registration.status,
      paymentStatus: registration.payment_status,
      checkedIn: registration.checked_in,
      createdAt: registration.created_at,
      amountPaid: Number(registration.amount_paid ?? 0),
      amountDue: registration.amount_due == null ? null : Number(registration.amount_due),
      editionId: registration.edition_id ?? edition?.id ?? "",
      editionLabel: edition ? `${edition.year} ${edition.month}` : "",
    };
  });
}

export interface PersonPaymentSummary {
  received: number;
  refunded: number;
  netPaid: number;
  due: number;
  outstanding: number;
  refundLiability: number;
}

export async function fetchPersonPaymentSummary(
  personId: string,
  authHeaders: () => Record<string, string>,
  signal?: AbortSignal,
): Promise<PersonPaymentSummary> {
  const response = await fetch(`/api/people/${encodeURIComponent(personId)}/payment-summary`, {
    signal,
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to load payment summary: ${response.status}`);

  const data = (await response.json()) as Record<string, unknown>;
  return {
    received: Number(data.received ?? 0),
    refunded: Number(data.refunded ?? 0),
    netPaid: Number(data.net_paid ?? 0),
    due: Number(data.due ?? 0),
    outstanding: Number(data.outstanding ?? 0),
    refundLiability: Number(data.refund_liability ?? 0),
  };
}

export async function createAdminRegistration(
  payload: CreateRegistrationPayload,
  authHeaders: () => Record<string, string>,
): Promise<Registration> {
  const res = await fetch("/api/registrations/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
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
  });

  if (!res.ok) throw await apiErrorFromResponse(res, m.admin_error_create_registration());

  const data = await res.json();
  return apiToRegistration(data as Record<string, unknown>);
}

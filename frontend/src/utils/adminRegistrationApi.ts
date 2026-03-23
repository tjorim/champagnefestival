import { m } from "@/paraglide/messages";
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
}

interface PersonSearchResult {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export type EditionEvent = Event;

export interface CreateRegistrationPayload {
  personId: string;
  eventId: string;
  guestCount: number;
  notes: string;
}

export interface PersonRegistration {
  id: string;
  eventTitle: string;
  guestCount: number;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  checkedIn: boolean;
  createdAt: string;
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
  event_title: string;
  guest_count: number;
  status: RegistrationStatus;
  payment_status: PaymentStatus;
  checked_in: boolean;
  created_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.event_title === "string" &&
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
  return Array.isArray(data) ? data.map(apiToEvent) : [];
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
  const data = (await response.json()) as PersonSearchResult[];
  return data.map((person) => ({
    value: person.id,
    label: person.name,
    sub: [person.email, person.phone].filter(Boolean).join(" · "),
    name: person.name,
    email: person.email,
    phone: person.phone,
  }));
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

  return raw.map((registration) => ({
    id: registration.id,
    eventTitle: registration.event_title,
    guestCount: registration.guest_count,
    status: registration.status,
    paymentStatus: registration.payment_status,
    checkedIn: registration.checked_in,
    createdAt: registration.created_at,
  }));
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
      pre_orders: [],
      notes: payload.notes,
      accessibility_note: "",
      status: "confirmed",
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_error_create_registration());
  }

  const data = await res.json();
  return apiToRegistration(data as Record<string, unknown>);
}

import { m } from "@/paraglide/messages";
import type { Registration } from "@/types/registration";
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

export interface EditionEvent {
  id: string;
  title: string;
  registration_required: boolean;
}

export interface CreateRegistrationPayload {
  personId: string;
  eventId: string;
  guestCount: number;
  notes: string;
}

export async function fetchRegistrableEvents(
  authHeaders: () => Record<string, string>,
): Promise<EditionEvent[]> {
  const response = await fetch("/api/editions/active", { headers: authHeaders() });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(m.admin_content_edition_no_events());
    }
    throw new Error(`Failed to load active edition (${response.status})`);
  }

  const data = (await response.json()) as { events?: EditionEvent[] };
  return (data.events ?? []).filter((event) => event.registration_required);
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

  if (!response.ok) {
    throw new Error("Failed to load people");
  }

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
    throw new Error((data as { detail?: string }).detail ?? m.admin_error_create_reservation());
  }

  const data = await res.json();
  return apiToRegistration(data as Record<string, unknown>);
}

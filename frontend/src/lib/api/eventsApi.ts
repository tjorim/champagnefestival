import type { Event, EventCreate } from "@/api-types";
import { m } from "@/paraglide/messages";
import { type EventFormData } from "@/types/event";
import { adminRequest } from "./adminApi";

function datetimeLocalToIso(value: string): string {
  return new Date(value).toISOString();
}

export async function fetchEditionEvents(editionId: string): Promise<Event[]> {
  const response = await adminRequest(
    `/api/events?edition_id=${encodeURIComponent(editionId)}`,
    {},
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Event[];
  return Array.isArray(data) ? data : [];
}

export function eventTextBody(formData: EventFormData) {
  const text = (value: string) => value.trim() || null;
  return {
    title_nl: text(formData.title_nl),
    title_fr: text(formData.title_fr),
    title_en: text(formData.title_en),
    description_nl: text(formData.description_nl),
    description_fr: text(formData.description_fr),
    description_en: text(formData.description_en),
  };
}

export async function saveEditionEvent(payload: {
  editionId: string;
  editingEventId?: string;
  formData: EventFormData;
}): Promise<Event> {
  const response = await adminRequest(
    payload.editingEventId ? `/api/events/${payload.editingEventId}` : "/api/events",
    {
      method: payload.editingEventId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        edition_id: payload.editionId,
        ...eventTextBody(payload.formData),
        date: payload.formData.date,
        start_time: payload.formData.start_time,
        end_time: payload.formData.end_time || null,
        category: payload.formData.category,
        volunteers_only: payload.formData.volunteers_only ?? false,
        members_only: payload.formData.members_only ?? false,
        registration_required: payload.formData.registration_required,
        registrations_open_from:
          payload.formData.registration_required && payload.formData.registrations_open_from
            ? datetimeLocalToIso(payload.formData.registrations_open_from)
            : null,
        registrations_close_at:
          payload.formData.registration_required && payload.formData.registrations_close_at
            ? datetimeLocalToIso(payload.formData.registrations_close_at)
            : null,
        active: payload.formData.active,
      } satisfies EventCreate),
    },
    m.admin_content_error_save(),
  );

  return (await response.json()) as Event;
}

export async function deleteEditionEvent(eventId: string): Promise<void> {
  await adminRequest(`/api/events/${eventId}`, { method: "DELETE" }, m.admin_content_error_save());
}

export async function fetchVolunteerPollEvents(): Promise<Event[]> {
  const response = await adminRequest("/api/events", {}, m.admin_content_error_load());
  const events = (await response.json()) as Event[];
  return events.filter((event) => event.volunteers_only);
}

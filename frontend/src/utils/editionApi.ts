import type { Edition, EditionDates, ScheduleEvent, SliderItem } from "@/config/editions";

interface ApiVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  lat: number;
  lng: number;
}

interface ApiEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string | null;
  category: ScheduleEvent["category"];
  registration_required: boolean;
  registrations_open_from: string | null;
}

export interface ApiEdition {
  id: string;
  year: number;
  month: string;
  venue: ApiVenue;
  events: ApiEvent[];
  producers: SliderItem[];
  sponsors: SliderItem[];
}

/** Parse "YYYY-MM-DD" as a local date (avoids UTC-midnight → previous day shift). */
export function parseLocalDate(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function deriveEditionDates(events: ApiEvent[], fallbackDates: EditionDates): EditionDates {
  const uniqueDates = [...new Set(events.map((event) => event.date))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map(parseLocalDate);

  if (uniqueDates.length === 0) {
    return fallbackDates;
  }

  const friday = uniqueDates[0] ?? fallbackDates.friday;
  const saturday = uniqueDates[1] ?? friday;
  const sunday = uniqueDates[2] ?? uniqueDates[uniqueDates.length - 1] ?? saturday;

  return { friday, saturday, sunday };
}

function buildSchedule(events: ApiEvent[]): ScheduleEvent[] {
  const uniqueDates = [...new Set(events.map((event) => event.date))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const dayIdByDate = new Map(uniqueDates.map((date, index) => [date, Math.min(index + 1, 3)]));

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    startTime: event.start_time,
    endTime: event.end_time ?? undefined,
    description: event.description,
    reservation: event.registration_required,
    reservationsOpenFrom: event.registrations_open_from
      ? new Date(event.registrations_open_from)
      : undefined,
    category: event.category,
    dayId: dayIdByDate.get(event.date) ?? 1,
  }));
}

export function mapApiEditionToEdition(api: ApiEdition, fallbackDates: EditionDates): Edition {
  return {
    id: api.id,
    year: api.year,
    month: api.month as Edition["month"],
    dates: deriveEditionDates(api.events ?? [], fallbackDates),
    venue: {
      venueName: api.venue.name,
      address: api.venue.address,
      city: api.venue.city,
      postalCode: api.venue.postal_code,
      country: api.venue.country,
      coordinates: { lat: api.venue.lat, lng: api.venue.lng },
    },
    schedule: buildSchedule(api.events ?? []),
    producers: api.producers ?? [],
    sponsors: api.sponsors ?? [],
  };
}

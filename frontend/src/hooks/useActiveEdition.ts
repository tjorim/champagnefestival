/**
 * useActiveEdition — fetches the active festival edition from the backend API.
 *
 * The public site now treats the backend as the source of truth for edition,
 * venue, and schedule data. This hook starts with an empty fallback shape for
 * initial render / network failures, then replaces it with `/api/editions/active`.
 */

import { useEffect, useState } from "react";
import { EMPTY_EDITION, type EditionDates, type Event, type SliderItem } from "@/config/editions";

interface ActiveEditionVenue {
  venueName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface ActiveEdition {
  id: string;
  year: number;
  month: "march" | "october";
  dates: EditionDates;
  venue: ActiveEditionVenue;
  events: Event[];
  producers: SliderItem[];
  sponsors: SliderItem[];
}

interface ApiVenue {
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
  category: string;
  registration_required: boolean;
  registrations_open_from: string | null;
}

interface ApiEdition {
  id: string;
  year: number;
  month: string;
  dates?: string[] | null;
  venue: ApiVenue;
  events: ApiEvent[];
  producers: SliderItem[];
  sponsors: SliderItem[];
}

export interface ActiveEditionState {
  edition: ActiveEdition;
  /** True once the fetch has settled (success or failure). */
  isLoaded: boolean;
}

/** Parse "YYYY-MM-DD" as a local date (avoids UTC-midnight → previous day shift). */
function parseLocalDate(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function deriveEditionDates(
  apiDates: string[] | null | undefined,
  eventDates: string[],
  fallbackDates: EditionDates,
): EditionDates {
  if (apiDates && apiDates.length > 0) {
    return apiDates.map(parseLocalDate);
  }

  const uniqueDates = [...new Set(eventDates)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (uniqueDates.length === 0) {
    return fallbackDates;
  }

  return uniqueDates.map(parseLocalDate);
}

function mapApiEdition(api: ApiEdition, fallbackDates: EditionDates): ActiveEdition {
  const events: Event[] = (api.events ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    startTime: event.start_time,
    endTime: event.end_time ?? undefined,
    category: event.category,
    registrationRequired: event.registration_required,
    registrationsOpenFrom: event.registrations_open_from
      ? new Date(event.registrations_open_from)
      : undefined,
  }));

  return {
    id: api.id,
    year: api.year,
    month: api.month as ActiveEdition["month"],
    dates: deriveEditionDates(api.dates, events.map((event) => event.date), fallbackDates),
    venue: {
      venueName: api.venue.name,
      address: api.venue.address,
      city: api.venue.city,
      postalCode: api.venue.postal_code,
      country: api.venue.country,
      coordinates: { lat: api.venue.lat, lng: api.venue.lng },
    },
    events,
    producers: api.producers ?? [],
    sponsors: api.sponsors ?? [],
  };
}

function createFallbackEdition(): ActiveEdition {
  return {
    id: EMPTY_EDITION.id,
    year: EMPTY_EDITION.year,
    month: EMPTY_EDITION.month,
    dates: EMPTY_EDITION.dates,
    venue: EMPTY_EDITION.venue,
    events: [],
    producers: [],
    sponsors: [],
  };
}

export function useActiveEdition(): ActiveEditionState {
  const [edition, setEdition] = useState<ActiveEdition>(createFallbackEdition);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/editions/active");
        if (!res.ok) {
          setIsLoaded(true);
          return;
        }

        const api = (await res.json()) as ApiEdition;
        if (cancelled) return;
        setEdition((current) => mapApiEdition(api, current.dates));
        setIsLoaded(true);
      } catch {
        // Network error or parse failure — keep the empty fallback silently.
        setIsLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { edition, isLoaded };
}

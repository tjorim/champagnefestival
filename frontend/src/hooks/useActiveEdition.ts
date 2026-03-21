/**
 * useActiveEdition — fetches the active festival edition from the backend API.
 *
 * Initialises with the static fallback from `editions.ts` (immediate, no flash),
 * then fetches `/api/editions/active` to get live data including embedded venue,
 * events, producers, and sponsors.
 * Silently keeps the static fallback on any network or parse error.
 */

import { useEffect, useState } from "react";
import { getActiveEdition, type Edition, type EditionDates, type SliderItem } from "@/config/editions";

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

export interface ActiveEditionEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime?: string;
  category: string;
  registrationRequired: boolean;
  registrationsOpenFrom?: Date;
}

export interface ActiveEdition {
  id: string;
  year: number;
  month: "march" | "october";
  dates: EditionDates;
  venue: ActiveEditionVenue;
  events: ActiveEditionEvent[];
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

function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deriveEditionDates(eventDates: string[], fallbackDates: EditionDates): EditionDates {
  const uniqueDates = [...new Set(eventDates)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (uniqueDates.length === 0) {
    return fallbackDates;
  }
  const friday = parseLocalDate(uniqueDates[0]!);
  const saturday = parseLocalDate(uniqueDates[1] ?? uniqueDates[0]!);
  const sunday = parseLocalDate(uniqueDates[2] ?? uniqueDates[uniqueDates.length - 1]!);
  return { friday, saturday, sunday };
}

function mapStaticEdition(edition: Edition): ActiveEdition {
  const dayDates = [edition.dates.friday, edition.dates.saturday, edition.dates.sunday];
  return {
    id: edition.id,
    year: edition.year,
    month: edition.month,
    dates: edition.dates,
    venue: edition.venue,
    events: edition.schedule.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      date: toLocalISODate(dayDates[event.dayId - 1] ?? edition.dates.friday),
      startTime: event.startTime,
      endTime: event.endTime,
      category: event.category,
      registrationRequired: Boolean(event.reservation),
      registrationsOpenFrom: event.reservationsOpenFrom,
    })),
    producers: edition.producers,
    sponsors: edition.sponsors,
  };
}

function mapApiEdition(api: ApiEdition, fallbackDates: EditionDates): ActiveEdition {
  const events = (api.events ?? []).map((event) => ({
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
    dates: deriveEditionDates(events.map((event) => event.date), fallbackDates),
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

export function useActiveEdition(): ActiveEditionState {
  const [edition, setEdition] = useState<ActiveEdition>(() => mapStaticEdition(getActiveEdition()));
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
        setEdition(mapApiEdition(api, getActiveEdition().dates));
        setIsLoaded(true);
      } catch {
        // Network error or parse failure — keep static fallback silently.
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

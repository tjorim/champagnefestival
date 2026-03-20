/**
 * useActiveEdition — fetches the active festival edition from the backend API.
 *
 * Initialises with the static fallback from `editions.ts` (immediate, no flash),
 * then fetches `/api/editions/active` to get live data including embedded venue,
 * producers, and sponsors.
 * Silently keeps the static fallback on any network or parse error.
 */

import { useEffect, useState } from "react";
import { getActiveEdition, type Edition, type SliderItem } from "../config/editions";

export interface ActiveEditionState {
  edition: Edition;
  /** True once the fetch has settled (success or failure). */
  isLoaded: boolean;
}

/** Parse "YYYY-MM-DD" as a local date (avoids UTC-midnight → previous day shift). */
function parseLocalDate(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

export function useActiveEdition(): ActiveEditionState {
  const [edition, setEdition] = useState<Edition>(getActiveEdition);
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

        interface ApiScheduleEvent {
          id: string;
          title: string;
          start_time: string;
          end_time: string | null;
          description: string;
          reservation: boolean;
          reservations_open_from: string | null;
          location: string | null;
          presenter: string | null;
          category: "tasting" | "vip" | "party" | "breakfast" | "exchange" | "general";
          day_id: number;
        }
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
        interface ApiEdition {
          id: string;
          year: number;
          month: string;
          friday: string;
          saturday: string;
          sunday: string;
          venue: ApiVenue;
          schedule: ApiScheduleEvent[];
          producers: SliderItem[];
          sponsors: SliderItem[];
        }

        const api = (await res.json()) as ApiEdition;
        if (cancelled) return;

        const newEdition: Edition = {
          id: api.id,
          year: api.year,
          month: api.month as "march" | "october",
          dates: {
            friday: parseLocalDate(api.friday),
            saturday: parseLocalDate(api.saturday),
            sunday: parseLocalDate(api.sunday),
          },
          venue: {
            venueName: api.venue.name,
            address: api.venue.address,
            city: api.venue.city,
            postalCode: api.venue.postal_code,
            country: api.venue.country,
            coordinates: { lat: api.venue.lat, lng: api.venue.lng },
          },
          schedule: api.schedule.map((ev) => ({
            id: ev.id,
            title: ev.title,
            startTime: ev.start_time,
            endTime: ev.end_time ?? undefined,
            description: ev.description,
            reservation: ev.reservation,
            reservationsOpenFrom: ev.reservations_open_from
              ? new Date(ev.reservations_open_from)
              : undefined,
            location: ev.location ?? undefined,
            presenter: ev.presenter ?? undefined,
            category: ev.category,
            dayId: ev.day_id,
          })),
          producers: api.producers ?? [],
          sponsors: api.sponsors ?? [],
        };

        setEdition(newEdition);
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

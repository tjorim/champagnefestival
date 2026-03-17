/**
 * useActiveEdition — fetches the active festival edition from the backend API.
 *
 * Initialises with the static fallback from `editions.ts` (immediate, no flash),
 * then fetches `/api/editions` and `/api/venues/{id}` to get live data.
 * Silently keeps the static fallback on any network or parse error.
 */

import { useEffect, useState } from "react";
import { getActiveEdition, type Edition } from "../config/editions";

export interface ActiveEditionState {
  edition: Edition;
  /** True once the API responded successfully with live data. */
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
        const editionsRes = await fetch("/api/editions");
        if (!editionsRes.ok) return;

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
        interface ApiEdition {
          id: string;
          year: number;
          month: string;
          friday: string;
          saturday: string;
          sunday: string;
          venue_id: string;
          schedule: ApiScheduleEvent[];
        }

        const apiEditions = (await editionsRes.json()) as ApiEdition[];
        if (!Array.isArray(apiEditions) || apiEditions.length === 0) return;

        // Same active-edition logic as getActiveEdition() in editions.ts
        const now = new Date();
        const sorted = [...apiEditions].sort(
          (a, b) => parseLocalDate(a.friday).getTime() - parseLocalDate(b.friday).getTime(),
        );
        const activeApi =
          sorted.find((e) => {
            const sundayEnd = parseLocalDate(e.sunday);
            sundayEnd.setHours(23, 59, 59, 999);
            return sundayEnd >= now;
          }) ?? sorted[sorted.length - 1]!;

        const venueRes = await fetch(`/api/venues/${activeApi.venue_id}`);
        if (!venueRes.ok) return;

        interface ApiVenue {
          name: string;
          address: string;
          city: string;
          postal_code: string;
          country: string;
          lat: number;
          lng: number;
        }
        const apiVenue = (await venueRes.json()) as ApiVenue;

        if (cancelled) return;

        const friday = parseLocalDate(activeApi.friday);
        const saturday = parseLocalDate(activeApi.saturday);
        const sunday = parseLocalDate(activeApi.sunday);

        const newEdition: Edition = {
          id: activeApi.id,
          year: activeApi.year,
          month: activeApi.month as "march" | "october",
          dates: { friday, saturday, sunday },
          venue: {
            venueName: apiVenue.name,
            address: apiVenue.address,
            city: apiVenue.city,
            postalCode: apiVenue.postal_code,
            country: apiVenue.country,
            coordinates: { lat: apiVenue.lat, lng: apiVenue.lng },
          },
          schedule: activeApi.schedule.map((ev) => ({
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
        };

        setEdition(newEdition);
        setIsLoaded(true);
      } catch {
        // Network error or parse failure — keep static fallback silently.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { edition, isLoaded };
}

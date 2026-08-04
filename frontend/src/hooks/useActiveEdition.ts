/**
 * useActiveEdition — fetches the active festival edition from the backend API.
 *
 * The public site now treats the backend as the source of truth for edition,
 * venue, and schedule data. This hook starts with an empty fallback shape for
 * initial render / network failures, then replaces it with `/api/editions/active`.
 */

import { queryOptions, useQuery } from "@tanstack/react-query";
import { EMPTY_EDITION, type EditionDates, type SliderItem } from "@/config/editions";
import { apiToEvent, type Event } from "@/types/event";
import type { EditionType } from "@/components/admin/editionTypes";
import { endOfDay } from "@/utils/dateUtils";
import { queryKeys } from "@/utils/queryKeys";

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
  /** Needed by the admin views, which run non-festival editions too. */
  editionType: EditionType;
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

interface ApiEdition {
  id: string;
  year: number;
  edition_type?: string;
  month: string;
  dates?: string[] | null;
  venue: ApiVenue;
  events: Record<string, unknown>[];
  producers: SliderItem[];
  sponsors: SliderItem[];
}

export interface ActiveEditionState {
  edition: ActiveEdition;
  /** True once the fetch has settled (success or failure). */
  isLoaded: boolean;
  /** True only when a real edition was fetched — false while loading or when there's none/an error. */
  hasEdition: boolean;
  /** True when the fetch itself failed (network error, 5xx, ...) — false for the legitimate "no active edition" 404. */
  hasLoadError: boolean;
}

/** Thrown when the API responds with a non-ok status; carries the status so callers can tell a real failure apart from a 404 "no active edition" response. */
export class ActiveEditionFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ActiveEditionFetchError";
    this.status = status;
  }
}

export const activeEditionQueryKey = queryKeys.activeEdition;

/** Parse "YYYY-MM-DD" as a local date (avoids UTC-midnight → previous day shift). */
function parseLocalDate(s: string): Date {
  if (typeof s !== "string") {
    throw new Error(`Invalid edition date: expected a string, received ${typeof s}.`);
  }

  const parts = s.split("-");
  if (parts.length !== 3) {
    throw new Error(`Invalid edition date ${JSON.stringify(s)}: expected YYYY-MM-DD.`);
  }

  const numericParts = parts.map(Number);
  const year = numericParts[0];
  const month = numericParts[1];
  const day = numericParts[2];
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid edition date ${JSON.stringify(s)}: expected YYYY-MM-DD.`);
  }
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(`Invalid edition date ${JSON.stringify(s)}: expected numeric YYYY-MM-DD.`);
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`Invalid edition date ${JSON.stringify(s)}: out-of-range calendar date.`);
  }

  return parsed;
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
  const events: Event[] = (api.events ?? []).map((event) => apiToEvent(event));

  return {
    id: api.id,
    year: api.year,
    month: api.month as ActiveEdition["month"],
    dates: deriveEditionDates(
      api.dates,
      events.map((event) => event.date),
      fallbackDates,
    ),
    editionType:
      api.edition_type === "bourse" || api.edition_type === "capsule_exchange"
        ? api.edition_type
        : "festival",
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
    editionType: "festival",
    month: EMPTY_EDITION.month,
    dates: EMPTY_EDITION.dates,
    venue: EMPTY_EDITION.venue,
    events: [],
    producers: [],
    sponsors: [],
  };
}

/**
 * Which editions a caller considers "active".
 *
 * The public site is a festival site — its countdown, marquees and structured
 * data must never latch onto a bourse — so it stays pinned to `"festival"`.
 * The admin dashboard runs whichever edition is next, whatever its type, so
 * that floor plans and the event-day views work for a bourse or capsule
 * exchange too.
 */
export type ActiveEditionScope = "festival" | "any";

export async function fetchActiveEdition(
  scope: ActiveEditionScope = "festival",
): Promise<ActiveEdition> {
  const query = scope === "festival" ? "?edition_type=festival" : "";
  const res = await fetch(`/api/editions/active${query}`);
  if (!res.ok) {
    throw new ActiveEditionFetchError(`Failed to load active edition: ${res.status}`, res.status);
  }

  const api = (await res.json()) as ApiEdition;
  return mapApiEdition(api, EMPTY_EDITION.dates);
}

export function activeEditionQueryOptions(scope: ActiveEditionScope = "festival") {
  return queryOptions({
    // Scoped key: the public and admin views resolve different editions and
    // must not share a cache entry.
    queryKey: scope === "festival" ? activeEditionQueryKey : queryKeys.admin.activeEdition,
    queryFn: () => fetchActiveEdition(scope),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useActiveEdition(scope: ActiveEditionScope = "festival"): ActiveEditionState {
  const query = useQuery(activeEditionQueryOptions(scope));
  const isNotFound = query.error instanceof ActiveEditionFetchError && query.error.status === 404;

  return {
    edition: query.data ?? createFallbackEdition(),
    isLoaded: query.status !== "pending",
    hasEdition: query.isSuccess,
    hasLoadError: query.isError && !isNotFound,
  };
}

/** Festival opens at 17:00 on the first day and runs through the end of the last day. */
export function getFestivalDateRange(edition: ActiveEdition): { start: Date; end: Date } {
  const start = new Date(edition.dates[0] ?? new Date());
  start.setHours(17, 0, 0, 0);
  const end = endOfDay(edition.dates[edition.dates.length - 1] ?? new Date());
  return { start, end };
}

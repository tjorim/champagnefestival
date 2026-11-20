import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EditionPublicOut, EventPublicOut as Event } from "@/api-types";

export type ApiUpcomingEdition = EditionPublicOut;

const OTHER_EDITION_TYPES = ["bourse", "capsule_exchange"] as const;
type OtherEditionType = (typeof OTHER_EDITION_TYPES)[number];

const EDITION_TYPES = new Set<ApiUpcomingEdition["edition_type"]>([
  "festival",
  ...OTHER_EDITION_TYPES,
]);

export interface OtherEventCardData {
  id: string;
  edition_type: ApiUpcomingEdition["edition_type"];
  event: Event;
  venueName: string;
  /** The organization who ran this edition with the vzw, credited on the card. */
  coOrganizerName?: string;
  coOrganizerWebsite?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiEvent(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const requiredStrings = [
    "id",
    "edition_id",
    "title",
    "description",
    "date",
    "start_time",
    "category",
    "created_at",
    "updated_at",
  ];
  const endTimeIsValid =
    value.end_time === null || value.end_time === undefined || typeof value.end_time === "string";
  const registrationsOpenFromIsValid =
    value.registrations_open_from === null ||
    value.registrations_open_from === undefined ||
    typeof value.registrations_open_from === "string";
  const registrationsCloseAtIsValid =
    value.registrations_close_at === null ||
    value.registrations_close_at === undefined ||
    typeof value.registrations_close_at === "string";
  return (
    requiredStrings.every((key) => typeof value[key] === "string") &&
    typeof value.registration_required === "boolean" &&
    typeof value.active === "boolean" &&
    endTimeIsValid &&
    registrationsOpenFromIsValid &&
    registrationsCloseAtIsValid
  );
}

function parseUpcomingEditions(payload: unknown): ApiUpcomingEdition[] {
  if (!Array.isArray(payload)) {
    throw new Error("Upcoming editions response must be an array.");
  }

  return payload.map((value, index) => {
    const context = `upcoming editions[${index}]`;
    if (!isRecord(value)) throw new Error(`${context} must be an object.`);
    if (typeof value.id !== "string") throw new Error(`${context}.id must be a string.`);
    if (!EDITION_TYPES.has(value.edition_type as ApiUpcomingEdition["edition_type"])) {
      throw new Error(`${context}.edition_type is invalid.`);
    }

    const rawEvents = value.events;
    if (
      !Array.isArray(rawEvents) ||
      !rawEvents.every(isApiEvent) ||
      !rawEvents.every((event) => event.edition_id === value.id)
    ) {
      throw new Error(`${context}.events must contain valid events for this edition.`);
    }

    if (!isRecord(value.venue) || typeof value.venue.name !== "string") {
      throw new Error(`${context}.venue must be an object with a name.`);
    }
    return value as unknown as EditionPublicOut;
  });
}

async function fetchOtherEditionType(
  edition_type: OtherEditionType,
): Promise<ApiUpcomingEdition[]> {
  const response = await fetch(`/api/editions/upcoming?edition_type=${edition_type}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${edition_type} other events: ${response.status}`);
  }

  const editions = parseUpcomingEditions(await response.json());
  return editions.filter((edition) => edition.edition_type === edition_type);
}

async function fetchOtherEditions(): Promise<ApiUpcomingEdition[]> {
  const groupedEditions = await Promise.all(OTHER_EDITION_TYPES.map(fetchOtherEditionType));
  return groupedEditions.flat();
}

/**
 * Upcoming bourses and capsule exchanges as one card per active event, sorted by
 * date and time. Shared by the Other events section and the navigation, which
 * hides its link while there is nothing to show.
 */
export function useOtherEventItems() {
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["other-events"],
    queryFn: fetchOtherEditions,
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo<OtherEventCardData[]>(() => {
    // Off-festival editions may hold multiple same-day events (opening, tasting, auction, ...).
    // Every active event is rendered as its own card; inactive (draft) events stay hidden.
    const cards = data.flatMap((edition): OtherEventCardData[] =>
      (edition.events ?? [])
        .filter((event) => event.active)
        .map((event) => ({
          id: event.id,
          edition_type: edition.edition_type,
          event,
          venueName: edition.venue?.name ?? "",
          coOrganizerName:
            typeof edition.co_organizer?.name === "string"
              ? edition.co_organizer.name || undefined
              : undefined,
          coOrganizerWebsite: /^https?:\/\//.test(edition.co_organizer?.website ?? "")
            ? edition.co_organizer?.website
            : undefined,
        })),
    );

    return cards.sort(
      (left, right) =>
        left.event.date.localeCompare(right.event.date) ||
        left.event.start_time.localeCompare(right.event.start_time),
    );
  }, [data]);

  return { items, isLoading, isError };
}

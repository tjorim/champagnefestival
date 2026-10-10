import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/utils/queryKeys";

/** One stand of one organization on one festival day (public subset of a floor-plan area). */
export interface Stand {
  event_id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  room_name: string;
  label: string;
}

export interface OrganizationStands {
  organization_id: number;
  name: string;
  stands: Stand[];
}

export interface EditionStands {
  edition_id: string;
  organizations: OrganizationStands[];
}

/**
 * Public `GET /api/editions/{id}/stands`. The stand list is a convenience on top
 * of the lineup, so callers treat a failure as "no stands" rather than an error.
 */
export async function fetchEditionStands(editionId: string): Promise<EditionStands> {
  const res = await fetch(`/api/editions/${encodeURIComponent(editionId)}/stands`);
  if (!res.ok) throw new Error(`Failed to load stands: ${res.status}`);
  return (await res.json()) as EditionStands;
}

export function editionStandsQueryOptions(editionId: string) {
  return queryOptions({
    queryKey: queryKeys.editionStands(editionId),
    queryFn: () => fetchEditionStands(editionId),
    // The API response is cached for 60 s; match it so the page re-checks on focus.
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function standsByOrganization(
  organizations: readonly OrganizationStands[] | undefined,
): Map<number, Stand[]> {
  return new Map((organizations ?? []).map((item) => [item.organization_id, item.stands]));
}

/** Parse `YYYY-MM-DD` as a local date so it never shifts a day across timezones. */
function parseStandDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export interface StandSummaryLine {
  /** Day label (for example "Fri 20 Mar"); `null` when the stand is the same on every day. */
  day: string | null;
  /** Stand label, with the room appended when the edition has more than one room. */
  stand: string;
}

/**
 * Lines to show for one organization: a single line when it stands in the same
 * spot on all its days, otherwise one line per day. The room is only named when
 * the lineup's stands span several rooms (`showRoom`).
 */
export function summarizeStands(
  stands: readonly Stand[],
  locale: string,
  showRoom: boolean,
): StandSummaryLine[] {
  const describe = (stand: Stand) =>
    showRoom && stand.room_name ? `${stand.label} · ${stand.room_name}` : stand.label;
  const distinct = new Set(stands.map(describe));
  if (distinct.size <= 1) {
    const first = stands[0];
    return first ? [{ day: null, stand: describe(first) }] : [];
  }
  const dayFormat = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return stands.map((stand) => ({
    day: dayFormat.format(parseStandDate(stand.date)),
    stand: describe(stand),
  }));
}

/** True when the given stands are spread over more than one room. */
export function hasMultipleRooms(organizations: readonly OrganizationStands[]): boolean {
  return (
    new Set(organizations.flatMap((item) => item.stands.map((stand) => stand.room_name))).size > 1
  );
}

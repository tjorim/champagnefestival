/**
 * Central configuration for festival dates.
 *
 * This module now exposes only a frontend fallback date shape.
 * The live site derives its actual dates from the active-edition API response.
 */

import { dayjs, endOfDay, localizedMonthName } from "@/utils/dateUtils";
import { EMPTY_EDITION } from "./editions";

const edition = EMPTY_EDITION;

export interface FestivalDateRangeStrings {
  en: string;
  fr: string;
  nl: string;
}

// ── Year and edition identifier ───────────────────────────────────────────────

export const festivalYear = edition.year;

/** The month of the active edition — type is inferred from the Edition interface. */
export const activeEdition = edition.month;

// ── Festival start / end dates ────────────────────────────────────────────────

// Festival opens at 17:00 on the first listed edition day
export const festivalDate =
  edition.dates.length === 0
    ? null
    : new Date(
        edition.dates[0]!.getFullYear(),
        edition.dates[0]!.getMonth(),
        edition.dates[0]!.getDate(),
        17,
        0,
        0,
        0,
      );

// End of the festival day — set to end of day so it represents the true day-end.
// This is the canonical end time used by all consumers (Countdown, JsonLd, etc.).
export const festivalEndDate =
  edition.dates.length === 0 ? null : endOfDay(edition.dates[edition.dates.length - 1]!);

// ── Individual festival days ──────────────────────────────────────────────────

// Clone the source Date objects to prevent external mutation of the shared Edition data.
export const festivalDays: readonly Date[] =
  edition.dates.length === 0
    ? []
    : edition.dates.map((date) => new Date(date.getTime()));

// ── Localised date-range strings ──────────────────────────────────────────────

function generateDateRangeStrings(): FestivalDateRangeStrings {
  if (edition.dates.length === 0) {
    return {
      en: "",
      fr: "",
      nl: "",
    };
  }

  const start = edition.dates[0]!;
  const end = edition.dates[edition.dates.length - 1]!;
  const startDay = dayjs(start).date();
  const endDay = dayjs(end).date();
  const year = edition.year;

  return {
    en: `${localizedMonthName(start, "en")} ${startDay}-${endDay}, ${year}`,
    fr: `${startDay}-${endDay} ${localizedMonthName(start, "fr")} ${year}`,
    nl: `${startDay}-${endDay} ${localizedMonthName(start, "nl")} ${year}`,
  };
}

// Automatically generated formatted date strings for use in translations
export const festivalDateRange = generateDateRangeStrings();

/**
 * Central configuration for festival dates.
 *
 * This module now exposes only a frontend fallback date shape.
 * The live site derives its actual dates from the active-edition API response.
 */

import { dayjs, endOfDay, localizedMonthName } from "@/utils/dateUtils";
import { EMPTY_EDITION } from "./editions";

const edition = EMPTY_EDITION;

// ── Year and edition identifier ───────────────────────────────────────────────

export const festivalYear = edition.year;

/** The month of the active edition — type is inferred from the Edition interface. */
export const activeEdition = edition.month;

// ── Festival start / end dates ────────────────────────────────────────────────

// Festival opens at 17:00 on Friday
export const festivalDate = new Date(
  edition.dates.friday.getFullYear(),
  edition.dates.friday.getMonth(),
  edition.dates.friday.getDate(),
  17,
  0,
  0,
  0,
);

// End of the festival day — set to end of day so it represents the true day-end.
// This is the canonical end time used by all consumers (Countdown, JsonLd, etc.).
export const festivalEndDate = endOfDay(edition.dates.sunday);

// ── Individual festival days ──────────────────────────────────────────────────

// Clone the source Date objects to prevent external mutation of the shared Edition data.
export const festivalDays = [
  new Date(edition.dates.friday.getTime()),
  new Date(edition.dates.saturday.getTime()),
  new Date(edition.dates.sunday.getTime()),
] as const;

// ── Localised date-range strings ──────────────────────────────────────────────

function generateDateRangeStrings() {
  const friday = edition.dates.friday;
  const startDay = dayjs(friday).date();
  const endDay = dayjs(edition.dates.sunday).date();
  const year = edition.year;

  return {
    en: `${localizedMonthName(friday, "en")} ${startDay}-${endDay}, ${year}`,
    fr: `${startDay}-${endDay} ${localizedMonthName(friday, "fr")} ${year}`,
    nl: `${startDay}-${endDay} ${localizedMonthName(friday, "nl")} ${year}`,
  };
}

// Automatically generated formatted date strings for use in translations
export const festivalDateRange = generateDateRangeStrings();

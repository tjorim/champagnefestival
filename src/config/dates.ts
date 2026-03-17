/**
 * Central configuration for festival dates.
 *
 * All values are derived from the active edition defined in `editions.ts`.
 * To change the active dates, add or modify an edition there — no changes
 * are needed in this file.
 */

import dayjs from "dayjs";
import "dayjs/locale/nl";
import "dayjs/locale/fr";
import { getActiveEdition } from "./editions";

const edition = getActiveEdition();

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
export const festivalEndDate = dayjs(edition.dates.sunday).endOf("day").toDate();

// ── Individual festival days ──────────────────────────────────────────────────

// Clone the source Date objects to prevent external mutation of the shared Edition data.
export const festivalDays = [
  new Date(edition.dates.friday.getTime()),
  new Date(edition.dates.saturday.getTime()),
  new Date(edition.dates.sunday.getTime()),
] as const;

// ── Localised date-range strings ──────────────────────────────────────────────

function generateDateRangeStrings() {
  const friday = dayjs(edition.dates.friday);
  const startDay = friday.date();
  const endDay = dayjs(edition.dates.sunday).date();
  const year = edition.year;

  return {
    en: `${friday.locale("en").format("MMMM")} ${startDay}-${endDay}, ${year}`,
    fr: `${startDay}-${endDay} ${friday.locale("fr").format("MMMM")} ${year}`,
    nl: `${startDay}-${endDay} ${friday.locale("nl").format("MMMM")} ${year}`,
  };
}

// Automatically generated formatted date strings for use in translations
export const festivalDateRange = generateDateRangeStrings();

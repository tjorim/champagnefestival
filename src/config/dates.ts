/**
 * Central configuration for festival dates.
 *
 * All values are derived from the active edition defined in `editions.ts`.
 * To change the active dates, add or modify an edition there — no changes
 * are needed in this file.
 */

import { getActiveEdition } from "./editions";

const edition = getActiveEdition();

// ── Year and edition identifier ───────────────────────────────────────────────

export const festivalYear = edition.year;

/** The month of the active edition ("march" | "october"). */
export const activeEdition: "march" | "october" = edition.month;

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

export const festivalEndDate = new Date(edition.dates.sunday);

// ── Individual festival days ──────────────────────────────────────────────────

export const festivalDays = [
  edition.dates.friday,
  edition.dates.saturday,
  edition.dates.sunday,
] as const;

// ── Localised date-range strings ──────────────────────────────────────────────

const MONTH_NAMES = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  fr: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ],
  nl: [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ],
};

function generateDateRangeStrings() {
  const month = edition.dates.friday.getMonth(); // 0-indexed
  const startDay = edition.dates.friday.getDate();
  const endDay = edition.dates.sunday.getDate();
  const year = edition.year;

  return {
    en: `${MONTH_NAMES.en[month]} ${startDay}-${endDay}, ${year}`,
    fr: `${startDay}-${endDay} ${MONTH_NAMES.fr[month]} ${year}`,
    nl: `${startDay}-${endDay} ${MONTH_NAMES.nl[month]} ${year}`,
  };
}

// Automatically generated formatted date strings for use in translations
export const festivalDateRange = generateDateRangeStrings();

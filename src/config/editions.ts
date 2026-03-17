/**
 * Central registry of all festival editions.
 *
 * Each edition captures everything that is specific to one event:
 * the dates, the venue, and the full schedule.
 *
 * The active edition is resolved automatically by `getActiveEdition()`:
 * it returns the first upcoming edition (whose Sunday has not yet passed),
 * or the most-recent past edition when all editions are in the past.
 *
 * To add a new edition, append an entry to the `editions` array below.
 * No other files need to change — `dates.ts`, `schedule.ts`, and
 * `contact.ts` all derive their values from `getActiveEdition()`.
 */

import dayjs from "dayjs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EditionDates {
  friday: Date;
  saturday: Date;
  sunday: Date;
}

export interface EditionVenue {
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

export interface ScheduleEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  description: string;
  reservation?: boolean;
  /** Earliest date/time from which reservations are accepted for this event.
   *  Omit (or set to a past date) to open immediately.
   *  Set to a future date to gate early bookings until announced. */
  reservationsOpenFrom?: Date;
  location?: string;
  presenter?: string;
  category: "tasting" | "vip" | "party" | "breakfast" | "exchange" | "general";
  dayId: number;
}

export interface Edition {
  /** Unique identifier, e.g. "2026-march" */
  id: string;
  year: number;
  month: "march" | "october";
  dates: EditionDates;
  venue: EditionVenue;
  /** Schedule events for this edition. Empty array means TBD. */
  schedule: ScheduleEvent[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculates the first Friday of a given month that is part of a full
 * Fri–Sat–Sun weekend.
 * @param year The full year (e.g. 2026).
 * @param month The month number (1–12, where 1 = January and 12 = December).
 */
function getFirstFullWeekend(year: number, month: number): EditionDates {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sun … 6 = Sat

  let daysToAdd: number;
  if (firstDayOfWeek <= 5) {
    daysToAdd = 5 - firstDayOfWeek; // days until first Friday
  } else {
    daysToAdd = 5 + 7 - firstDayOfWeek; // Saturday → skip to next Friday
  }

  return {
    friday: new Date(year, month - 1, 1 + daysToAdd),
    saturday: new Date(year, month - 1, 1 + daysToAdd + 1),
    sunday: new Date(year, month - 1, 1 + daysToAdd + 2),
  };
}

// ─── Venue definitions ───────────────────────────────────────────────────────

const venueBredene2026: EditionVenue = {
  venueName: "Meeting- en eventcentrum Staf Versluys",
  address: "Kapelstraat 76",
  city: "Bredene",
  postalCode: "8450",
  country: "België",
  coordinates: {
    lat: 51.252562,
    lng: 2.974563,
  },
};

// ─── Schedule definitions ────────────────────────────────────────────────────

const schedule2026March: ScheduleEvent[] = [
  // FRIDAY – Day 1
  {
    id: "fri-tasting",
    title: "Doorlopende degustatie",
    startTime: "17:00",
    endTime: "23:00",
    description: "Doorlopende degustatie van verschillende champagnes.",
    location: venueBredene2026.venueName,
    category: "tasting",
    dayId: 1,
  },
  {
    id: "fri-vip",
    title: "VIP-arrangement",
    startTime: "19:30",
    endTime: "21:30",
    description: "Exclusief VIP-arrangement (enkel op reservatie).",
    reservation: true,
    category: "vip",
    dayId: 1,
  },
  {
    id: "fri-end",
    title: "Einde festival",
    startTime: "23:00",
    description: "Sluiting van het festival op vrijdag.",
    category: "general",
    dayId: 1,
  },

  // SATURDAY – Day 2
  {
    id: "sat-exchange",
    title: "Ruilbeurs",
    startTime: "09:30",
    description: "Opening van de ruilbeurs voor verzamelaars.",
    reservation: true,
    category: "exchange",
    dayId: 2,
  },
  {
    id: "sat-opening",
    title: "Opening festival & doorlopende degustatie",
    startTime: "10:00",
    description:
      "Officiële opening van het festival op zaterdag met doorlopende champagne degustatie.",
    category: "tasting",
    dayId: 2,
  },
  {
    id: "sat-party",
    title: 'Champagneparty met huis DJ "Moustache"',
    startTime: "20:00",
    description: 'Feestelijke avond met huis DJ "Moustache" en champagne.',
    category: "party",
    dayId: 2,
  },
  {
    id: "sat-end",
    title: "Einde festival + party",
    startTime: "24:00", // display-only midnight marker; sorts correctly as a string after all other Saturday times
    description: "Sluiting van het festival en de party op zaterdag.",
    category: "general",
    dayId: 2,
  },

  // SUNDAY – Day 3
  {
    id: "sun-breakfast",
    title: "Champagneontbijt",
    startTime: "09:00",
    description: "Champagneontbijt ten voordele van een lokaal goed doel (enkel op reservatie).",
    reservation: true,
    category: "breakfast",
    dayId: 3,
  },
  {
    id: "sun-opening",
    title: "Opening festival & doorlopende degustatie",
    startTime: "10:00",
    description: "Opening van het festival op zondag met doorlopende champagne degustatie.",
    category: "tasting",
    dayId: 3,
  },
  {
    id: "sun-end",
    title: "Einde festival",
    startTime: "18:00",
    description: "Afsluiting van het festival op zondag.",
    category: "general",
    dayId: 3,
  },
];

// ─── Edition registry ────────────────────────────────────────────────────────

/**
 * All known festival editions, sorted chronologically (oldest first).
 * Add past and future editions here as they are confirmed.
 */
export const editions: Edition[] = [
  // ── 2026 March ─────────────────────────────────────────────────────────────
  // The 2026 March edition uses the second weekend (13–15 March) instead of
  // the first full weekend (6–8 March) returned by getFirstFullWeekend.
  {
    id: "2026-march",
    year: 2026,
    month: "march",
    dates: {
      friday: new Date(2026, 2, 13),
      saturday: new Date(2026, 2, 14),
      sunday: new Date(2026, 2, 15),
    },
    venue: venueBredene2026,
    schedule: schedule2026March,
  },

  // ── 2026 October ───────────────────────────────────────────────────────────
  // Dates are auto-calculated; venue and schedule will be updated once confirmed.
  {
    id: "2026-october",
    year: 2026,
    month: "october",
    dates: getFirstFullWeekend(2026, 10),
    venue: venueBredene2026,
    schedule: [], // TBD – update when the programme is confirmed
  },
];

// ─── Active-edition resolution ───────────────────────────────────────────────

/**
 * Returns the current or next upcoming edition.
 *
 * Selects the first edition (sorted chronologically) whose Sunday has not
 * yet passed. Falls back to the most-recent past edition when all known
 * editions are in the past.
 */
export function getActiveEdition(): Edition {
  if (editions.length === 0) {
    throw new Error(
      "No editions registered. Add at least one entry to the editions array in editions.ts.",
    );
  }
  const now = new Date();
  const sorted = [...editions].sort((a, b) => a.dates.friday.getTime() - b.dates.friday.getTime());
  return (
    sorted.find((e) => {
      const sundayEnd = dayjs(e.dates.sunday).endOf("day").toDate();
      return sundayEnd >= now;
    }) ?? sorted[sorted.length - 1]!
  );
}

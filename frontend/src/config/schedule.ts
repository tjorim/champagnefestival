/**
 * Schedule configuration for the Champagne Festival.
 *
 * This module now exposes only empty frontend fallbacks.
 * The live schedule is sourced from the active-edition API response.
 */

import { EMPTY_EDITION } from "./editions";
import type { Event } from "./editions";

export interface FestivalDay {
  id: number;
  date: string; // ISO date format
  label: string; // e.g., "friday", "saturday", "sunday"
}

const activeEdition = EMPTY_EDITION;

// Helper function to format date as ISO string in local time (Belgian time)
const toLocalISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Festival days derived from the active edition
export const festivalDays: FestivalDay[] = [
  {
    id: 1,
    date: toLocalISOString(activeEdition.dates.friday),
    label: "friday",
  },
  {
    id: 2,
    date: toLocalISOString(activeEdition.dates.saturday),
    label: "saturday",
  },
  {
    id: 3,
    date: toLocalISOString(activeEdition.dates.sunday),
    label: "sunday",
  },
];

// Schedule events from the frontend fallback edition shape.
export const scheduleEvents = [...activeEdition.schedule];

/**
 * Helper function to get events for a specific date
 */
export function getEventsByDate(date: string) {
  return scheduleEvents.filter((event) => event.date === date);
}

/**
 * Helper function to get events by category
 */
export function getEventsByCategory(category: Event["category"]) {
  return scheduleEvents.filter((event) => event.category === category);
}

/**
 * Helper function to get all events sorted by date then time
 */
export function getAllEventsSorted() {
  return [...scheduleEvents].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.startTime.localeCompare(b.startTime);
  });
}

/**
 * Helper function to check if an event requires registration
 */
export function requiresRegistration(event: Event): boolean {
  return event.registrationRequired;
}

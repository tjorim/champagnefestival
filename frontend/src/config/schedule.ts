/**
 * Schedule configuration for the Champagne Festival.
 *
 * This module now exposes only empty frontend fallbacks.
 * The live schedule is sourced from the active-edition API response.
 */

import { EMPTY_EDITION } from "./editions";
import type { ScheduleEvent } from "./editions";

// Re-export ScheduleEvent type from editions for backward compatibility
export type { ScheduleEvent };

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
 * Helper function to get events for a specific day
 */
export function getEventsByDay(dayId: number) {
  return scheduleEvents.filter((event) => event.dayId === dayId);
}

/**
 * Helper function to get events by category
 */
export function getEventsByCategory(category: ScheduleEvent["category"]) {
  return scheduleEvents.filter((event) => event.category === category);
}

/**
 * Helper function to get all events sorted by day and time
 */
export function getAllEventsSorted() {
  return [...scheduleEvents].sort((a, b) => {
    if (a.dayId !== b.dayId) {
      return a.dayId - b.dayId;
    }
    return a.startTime.localeCompare(b.startTime);
  });
}

/**
 * Helper function to check if an event requires reservation
 */
export function requiresReservation(event: ScheduleEvent): boolean {
  return Boolean(event.reservation);
}

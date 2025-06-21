/**
 * Schedule configuration for the Champagne Festival
 * Contains the structured data for events, workshops, tastings, and other activities
 */

import { contactConfig } from './contact';
import { festivalDays as configDays } from './dates';

export interface ScheduleEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  description: string;
  reservation?: boolean;
  location?: string;
  presenter?: string;
  category: 'tasting' | 'vip' | 'party' | 'breakfast' | 'exchange' | 'general';
  dayId: number;
}

export interface FestivalDay {
  id: number;
  date: string;  // ISO date format
  label: string; // e.g., "Friday", "Saturday", "Sunday"
}

// Helper function to format date as ISO string in local time (Belgian time)
const toLocalISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Festival days derived from central date configuration
export const festivalDays: FestivalDay[] = [
  {
    id: 1,
    date: toLocalISOString(configDays[0]), // Friday
    label: 'schedule.days.friday'
  },
  {
    id: 2,
    date: toLocalISOString(configDays[1]), // Saturday
    label: 'schedule.days.saturday'
  },
  {
    id: 3,
    date: toLocalISOString(configDays[2]), // Sunday
    label: 'schedule.days.sunday'
  }
];

// Schedule events with translations handled in the UI
export const scheduleEvents: ScheduleEvent[] = [
  // FRIDAY EVENTS - DAY 1
  {
    id: 'fri-tasting',
    title: 'Doorlopende degustatie',
    startTime: '17:00',
    endTime: '23:00',
    description: 'Doorlopende degustatie van verschillende champagnes.',
    location: contactConfig.location.venueName,
    category: 'tasting',
    dayId: 1
  },
  {
    id: 'fri-vip',
    title: 'VIP-receptie',
    startTime: '19:30',
    endTime: '21:30',
    description: 'Exclusieve VIP-receptie met speciale champagnes en hapjes.',
    reservation: true,
    category: 'vip',
    dayId: 1
  },
  {
    id: 'fri-end',
    title: 'Einde festival',
    startTime: '23:00',
    description: 'Sluiting van het festival op vrijdag.',
    category: 'general',
    dayId: 1
  },

  // SATURDAY EVENTS - DAY 2
  {
    id: 'sat-exchange',
    title: 'Ruilbeurs',
    startTime: '09:30',
    description: 'Opening van de ruilbeurs voor verzamelaars.',
    reservation: true,
    category: 'exchange',
    dayId: 2
  },
  {
    id: 'sat-opening',
    title: 'Opening festival & doorlopende degustatie',
    startTime: '10:00',
    description: 'Officiële opening van het festival op zaterdag met doorlopende champagne degustatie.',
    category: 'tasting',
    dayId: 2
  },
  {
    id: 'sat-party',
    title: 'Champagneparty met DJ',
    startTime: '20:00',
    description: 'Feestelijke avond met DJ en champagne.',
    category: 'party',
    dayId: 2
  },
  {
    id: 'sat-end',
    title: 'Einde festival + party',
    startTime: '23:59',
    description: 'Sluiting van het festival en de party op zaterdag.',
    category: 'general',
    dayId: 2
  },

  // SUNDAY EVENTS - DAY 3
  {
    id: 'sun-breakfast',
    title: 'Champagneontbijt',
    startTime: '09:00',
    description: 'Champagne ontbijt ten voordele van een goed doel.',
    reservation: true,
    category: 'breakfast',
    dayId: 3
  },
  {
    id: 'sun-opening',
    title: 'Opening festival & doorlopende degustatie',
    startTime: '10:00',
    description: 'Opening van het festival op zondag met doorlopende champagne degustatie.',
    category: 'tasting',
    dayId: 3
  },
  {
    id: 'sun-end',
    title: 'Einde festival',
    startTime: '18:00',
    description: 'Afsluiting van het festival op zondag.',
    category: 'general',
    dayId: 3
  }
];

/**
 * Helper function to get events for a specific day
 */
export function getEventsByDay(dayId: number): ScheduleEvent[] {
  return scheduleEvents.filter(event => event.dayId === dayId);
}

/**
 * Helper function to get events by category
 */
export function getEventsByCategory(category: ScheduleEvent['category']): ScheduleEvent[] {
  return scheduleEvents.filter(event => event.category === category);
}

/**
 * Helper function to get all events sorted by day and time
 */
export function getAllEventsSorted(): ScheduleEvent[] {
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
/**
 * Shared frontend edition types.
 *
 * Real edition, venue, and schedule content is fetched from the backend API.
 * This module only defines the shared shapes plus an empty loading/error fallback.
 */

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

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime?: string;
  category: string;
  registrationRequired: boolean;
  /** Earliest date/time from which registrations are accepted for this event. */
  registrationsOpenFrom?: Date;
}

export interface SliderItem {
  id: number;
  name: string;
  image: string;
  active?: boolean;
}

export interface Edition {
  id: string;
  year: number;
  month: "march" | "october";
  dates: EditionDates;
  venue: EditionVenue;
  schedule: Event[];
  producers: SliderItem[];
  sponsors: SliderItem[];
}

const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const dayAfterTomorrow = new Date(today);
dayAfterTomorrow.setDate(today.getDate() + 2);

export const EMPTY_EDITION: Edition = {
  id: "",
  year: today.getFullYear(),
  month: "march",
  dates: {
    friday: new Date(today),
    saturday: tomorrow,
    sunday: dayAfterTomorrow,
  },
  venue: {
    venueName: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
    coordinates: { lat: 0, lng: 0 },
  },
  schedule: [],
  producers: [],
  sponsors: [],
};

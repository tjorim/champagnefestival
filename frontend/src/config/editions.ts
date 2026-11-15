/**
 * Shared frontend edition types.
 *
 * Real edition, venue, and schedule content is fetched from the backend API.
 * This module only defines the shared shapes plus an empty loading/error fallback.
 */

export type EditionDates = Date[];

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

/** UI-only static schedule fallback; live events use EventPublicOut. */
export interface ScheduleEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  start_time: string;
  end_time?: string;
  category: string;
  volunteers_only?: boolean;
  members_only?: boolean;
  registration_required: boolean;
  /** Earliest date/time from which registrations are accepted for this event. */
  registrations_open_from?: Date;
}

/** Sponsor level within one edition, highest first; the order is the display order. */
export const SPONSOR_TIERS = ["main", "partner", "supporter"] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];

/** Display input for logo widgets; callers may supply just an image and name. */
export type SliderItem = Pick<import("@/api-types").EditionItemOut, "id" | "name" | "image"> &
  Partial<Omit<import("@/api-types").EditionItemOut, "id" | "name" | "image">>;

/** Static loading fallback only; API editions use EditionPublicOut/EditionOut. */
export interface FallbackEdition {
  id: string;
  year: number;
  month: "march" | "october";
  dates: EditionDates;
  venue: EditionVenue;
  schedule: ScheduleEvent[];
  producers: SliderItem[];
  sponsors: SliderItem[];
}

const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const dayAfterTomorrow = new Date(today);
dayAfterTomorrow.setDate(today.getDate() + 2);

export const EMPTY_EDITION: FallbackEdition = {
  id: "",
  year: today.getFullYear(),
  month: "march",
  dates: [new Date(today), tomorrow, dayAfterTomorrow],
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

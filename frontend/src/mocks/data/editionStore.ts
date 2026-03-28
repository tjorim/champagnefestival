import { seedEditions, seedEvents } from "./editions";

interface SeedVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  lat: number;
  lng: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface SeedEventEditionSummary {
  id: string;
  year: number;
  month: string;
  edition_type: string;
  active: boolean;
}

export interface SeedEvent {
  id: string;
  edition_id: string;
  title: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string | null;
  category: string;
  registration_required: boolean;
  registrations_open_from: string | null;
  max_capacity: number | null;
  sort_order: number;
  active: boolean;
  edition: SeedEventEditionSummary | null;
  created_at: string;
  updated_at: string;
}

export interface SeedEdition {
  id: string;
  year: number;
  month: string;
  edition_type: string;
  external_partner: string | null;
  external_contact_name: string | null;
  external_contact_email: string | null;
  dates: string[];
  venue: SeedVenue | null;
  events: SeedEvent[];
  producers: { id: number; name: string; image: string; website: string; type: string }[];
  sponsors: { id: number; name: string; image: string; website: string; type: string }[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Shared mutable in-memory stores for edition/event mocks. */
export const editions: SeedEdition[] = structuredClone(seedEditions) as SeedEdition[];
export const events: SeedEvent[] = structuredClone(seedEvents) as SeedEvent[];

export function resetEditionStore(): void {
  editions.splice(0, editions.length, ...(structuredClone(seedEditions) as SeedEdition[]));
  events.splice(0, events.length, ...(structuredClone(seedEvents) as SeedEvent[]));
}

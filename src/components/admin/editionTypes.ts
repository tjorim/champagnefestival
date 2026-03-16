/** Shared types and helpers for the edition management UI. */

export interface ScheduleEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  description: string;
  reservation: boolean;
  reservations_open_from: string | null;
  location: string | null;
  presenter: string | null;
  category: string;
  day_id: number;
}

export interface Edition {
  id: string;
  year: number;
  month: string;
  friday: string;
  saturday: string;
  sunday: string;
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_postal_code: string;
  venue_country: string;
  venue_lat: number;
  venue_lng: number;
  schedule: ScheduleEvent[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function parseEditionDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

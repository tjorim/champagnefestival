import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { m } from "@/paraglide/messages";

export interface VenuePlanTable {
  id: string;
  name: string;
  capacity: number;
  x: number;
  y: number;
  rotation: number;
  registration_ids: string[];
  occupied_seats: number;
}

export interface VenuePlanLayout {
  id: string;
  date: string | null;
  label: string;
  room: { id: string; name: string; width_m: number; length_m: number; color: string } | null;
  tables: VenuePlanTable[];
  areas: Array<{ id: string; label: string; icon: string; x: number; y: number; rotation: number }>;
}

export interface VenuePlan { edition_id: string; layouts: VenuePlanLayout[] }

export function fetchVenuePlan(
  editionId: string,
  authHeaders: () => Record<string, string>,
): Promise<VenuePlan> {
  return fetchJsonOrThrowWithUnauthorized<VenuePlan>(
    `/api/venue-plan/${encodeURIComponent(editionId)}`,
    { headers: authHeaders() },
    m.venue_plan_error(),
  );
}

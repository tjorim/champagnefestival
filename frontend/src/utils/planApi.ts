import { queryOptions } from "@tanstack/react-query";
import { getAreaSizePx, getCanvasSizePx } from "@/utils/layoutUtils";
import { queryKeys } from "@/utils/queryKeys";
import type { Stand } from "@/utils/standsApi";

/** One area (stand, stage, entrance, catering, ...) of the public floor plan. */
export interface PlanArea {
  id: string;
  label: string;
  icon: string;
  /** Canvas-relative percentages and clockwise degrees, see docs/floor-plan-coordinates.md. */
  x: number;
  y: number;
  rotation: number;
  width_m: number;
  length_m: number;
  organization_id: number | null;
}

export interface PlanRoom {
  id: string;
  name: string;
  width_m: number;
  length_m: number;
  color: string;
  areas: PlanArea[];
}

export interface PlanDay {
  event_id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  rooms: PlanRoom[];
}

export interface EditionPlan {
  edition_id: string;
  days: PlanDay[];
}

/** Public `GET /api/editions/{id}/plan`: rooms and areas only, never tables or registrations. */
export async function fetchEditionPlan(editionId: string): Promise<EditionPlan> {
  const res = await fetch(`/api/editions/${encodeURIComponent(editionId)}/plan`);
  if (!res.ok) throw new Error(`Failed to load the floor plan: ${res.status}`);
  return (await res.json()) as EditionPlan;
}

export function editionPlanQueryOptions(editionId: string) {
  return queryOptions({
    queryKey: queryKeys.editionPlan(editionId),
    queryFn: () => fetchEditionPlan(editionId),
    // The API response is cached for 60 s; match it so reopening the plan re-checks.
    staleTime: 60 * 1000,
    retry: false,
  });
}

/** Which organization's stand to highlight, and where it is on the plan. */
export interface PlanTarget {
  organizationId: number;
  stand: Stand;
}

export interface PlanSelection {
  eventId: string;
  roomId: string;
}

/**
 * The day and room to open for a target: the room named by the stand on the stand's
 * day, else any room of that day holding one of the organization's areas, else the
 * first room of the first day (the plan may have changed since the stand list loaded).
 */
export function initialPlanSelection(
  plan: EditionPlan,
  target: PlanTarget | null,
): PlanSelection | null {
  const days = plan.days.filter((day) => day.rooms.length > 0);
  const fallbackDay = days[0];
  if (!fallbackDay) return null;
  const fallbackRoom = fallbackDay.rooms[0];
  if (!fallbackRoom) return null;
  if (target) {
    const day = days.find((candidate) => candidate.event_id === target.stand.event_id);
    const holds = (room: PlanRoom) =>
      room.areas.some((area) => area.organization_id === target.organizationId);
    const room = day?.rooms.find(
      (candidate) => candidate.name === target.stand.room_name && holds(candidate),
    );
    const anyRoom = day?.rooms.find(holds);
    const found = room ?? anyRoom;
    if (day && found) return { eventId: day.event_id, roomId: found.id };
  }
  return { eventId: fallbackDay.event_id, roomId: fallbackRoom.id };
}

export interface PlanAreaBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * An area's box as percentages of the room canvas, so the plan scales with its
 * container. Canvas and area sizes follow docs/floor-plan-coordinates.md (including
 * the minimum canvas and area sizes); `x`/`y` anchor the area's top-left corner.
 */
export function planAreaBox(area: PlanArea, room: PlanRoom): PlanAreaBox {
  const canvas = getCanvasSizePx(room.width_m, room.length_m);
  const size = getAreaSizePx(area.width_m, area.length_m);
  return {
    left: area.x,
    top: area.y,
    width: (size.width / canvas.width) * 100,
    height: (size.height / canvas.height) * 100,
  };
}

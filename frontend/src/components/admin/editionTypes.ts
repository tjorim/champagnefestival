/** Shared types and helpers for the edition management UI. */

import { apiToEvent, type Event } from "@/types/event";

export type EditionType = "festival" | "bourse" | "capsule_exchange";

export interface Edition {
  id: string;
  year: number;
  month: string;
  editionType: EditionType;
  dates: string[];
  venue: {
    id: string;
    name: string;
    city: string;
    active: boolean;
    address?: string;
    country?: string;
  };
  events: Event[];
  producers?: { id: number; name: string; image: string; website: string }[];
  sponsors?: { id: number; name: string; image: string; website: string }[];
  vendors?: { id: number; name: string; image: string; website: string }[];
  /** The exhibitor co-organising this edition with the vzw, if any. */
  coOrganiser?: { id: number; name: string; image: string; website: string } | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function parseEditionDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function apiToEdition(data: Record<string, unknown>): Edition {
  return {
    id: String(data.id ?? ""),
    year: Number(data.year ?? new Date().getFullYear()),
    month: String(data.month ?? ""),
    editionType:
      data.edition_type === "bourse" || data.edition_type === "capsule_exchange"
        ? data.edition_type
        : "festival",
    dates: Array.isArray(data.dates)
      ? data.dates.filter((value): value is string => typeof value === "string")
      : [],
    venue:
      typeof data.venue === "object" && data.venue !== null
        ? {
            id: String((data.venue as Record<string, unknown>).id ?? ""),
            name: String((data.venue as Record<string, unknown>).name ?? ""),
            city: String((data.venue as Record<string, unknown>).city ?? ""),
            active: (data.venue as Record<string, unknown>).active !== false,
            address:
              typeof (data.venue as Record<string, unknown>).address === "string"
                ? ((data.venue as Record<string, unknown>).address as string)
                : undefined,
            country:
              typeof (data.venue as Record<string, unknown>).country === "string"
                ? ((data.venue as Record<string, unknown>).country as string)
                : undefined,
          }
        : { id: "", name: "", city: "", active: true },
    events: Array.isArray(data.events)
      ? data.events
          .filter(
            (event): event is Record<string, unknown> =>
              typeof event === "object" && event !== null,
          )
          .map(apiToEvent)
      : [],
    producers: Array.isArray(data.producers)
      ? data.producers
          .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
          .map((p) => ({
            id: Number(p.id ?? 0),
            name: String(p.name ?? ""),
            image: String(p.image ?? ""),
            website: String(p.website ?? ""),
          }))
      : [],
    sponsors: Array.isArray(data.sponsors)
      ? data.sponsors
          .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
          .map((s) => ({
            id: Number(s.id ?? 0),
            name: String(s.name ?? ""),
            image: String(s.image ?? ""),
            website: String(s.website ?? ""),
          }))
      : [],
    vendors: Array.isArray(data.vendors)
      ? data.vendors
          .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
          .map((v) => ({
            id: Number(v.id ?? 0),
            name: String(v.name ?? ""),
            image: String(v.image ?? ""),
            website: String(v.website ?? ""),
          }))
      : [],
    coOrganiser:
      typeof data.co_organiser === "object" && data.co_organiser !== null
        ? {
            id: Number((data.co_organiser as Record<string, unknown>).id ?? 0),
            name: String((data.co_organiser as Record<string, unknown>).name ?? ""),
            image: String((data.co_organiser as Record<string, unknown>).image ?? ""),
            website: String((data.co_organiser as Record<string, unknown>).website ?? ""),
          }
        : null,
    active: data.active !== false,
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
}

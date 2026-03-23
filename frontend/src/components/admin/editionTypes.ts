/** Shared types and helpers for the edition management UI. */

import { apiToEvent, type Event } from "@/types/event";

export type EditionType = "festival" | "bourse" | "capsule_exchange";

export interface Edition {
  id: string;
  year: number;
  month: string;
  editionType: EditionType;
  externalPartner?: string;
  externalContactName?: string;
  externalContactEmail?: string;
  dates: string[];
  venue: { id: string; name: string; city: string; active: boolean; address?: string; country?: string };
  events: Event[];
  producers?: { id: number; name: string; image: string; website: string }[];
  sponsors?: { id: number; name: string; image: string; website: string }[];
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
    externalPartner: typeof data.external_partner === "string" ? data.external_partner : undefined,
    externalContactName:
      typeof data.external_contact_name === "string" ? data.external_contact_name : undefined,
    externalContactEmail:
      typeof data.external_contact_email === "string" ? data.external_contact_email : undefined,
    dates: Array.isArray(data.dates)
      ? data.dates.filter((value): value is string => typeof value === "string")
      : [],
    venue: (data.venue ?? { id: "", name: "", city: "", active: true }) as Edition["venue"],
    events: Array.isArray(data.events)
      ? data.events
          .filter((event): event is Record<string, unknown> => typeof event === "object" && event !== null)
          .map(apiToEvent)
      : [],
    producers: Array.isArray(data.producers)
      ? (data.producers as Edition["producers"])
      : [],
    sponsors: Array.isArray(data.sponsors)
      ? (data.sponsors as Edition["sponsors"])
      : [],
    active: data.active !== false,
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
}

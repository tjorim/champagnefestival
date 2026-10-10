/** Shared types and helpers for the edition management UI. */

import { SPONSOR_TIERS, type SponsorTier } from "@/config/editions";
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
  sponsors?: {
    id: number;
    name: string;
    image: string;
    website: string;
    /** Level in this edition (#1226); `null` when the sponsor has none. */
    sponsorTier?: SponsorTier | null;
  }[];
  /** The lineup in the order the admin set (#1226); producers and sponsors, never vendors. */
  organizationIds?: number[];
  vendors?: { id: number; name: string; image: string; website: string }[];
  /** The organization co-organizing this edition with the vzw, if any. */
  coOrganizer?: { id: number; name: string; image: string; website: string } | null;
  /** Uploaded artwork paths (#1224); `null` means the static site image is used. */
  flyerImage?: string | null;
  heroImage?: string | null;
  shareImage?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function parseSponsorTier(value: unknown): SponsorTier | null {
  return SPONSOR_TIERS.find((tier) => tier === value) ?? null;
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
            sponsorTier: parseSponsorTier(s.sponsor_tier),
          }))
      : [],
    organizationIds: Array.isArray(data.organizations)
      ? data.organizations.filter((id): id is number => typeof id === "number")
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
    coOrganizer:
      typeof data.co_organizer === "object" && data.co_organizer !== null
        ? {
            id: Number((data.co_organizer as Record<string, unknown>).id ?? 0),
            name: String((data.co_organizer as Record<string, unknown>).name ?? ""),
            image: String((data.co_organizer as Record<string, unknown>).image ?? ""),
            website: String((data.co_organizer as Record<string, unknown>).website ?? ""),
          }
        : null,
    flyerImage: typeof data.flyer_image === "string" ? data.flyer_image : null,
    heroImage: typeof data.hero_image === "string" ? data.hero_image : null,
    shareImage: typeof data.share_image === "string" ? data.share_image : null,
    active: data.active !== false,
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
}

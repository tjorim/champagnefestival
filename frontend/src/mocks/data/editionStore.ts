import { seedEditions, seedEvents } from "./editions";

import type { EditionOut, EventOut } from "@/api-types";
export type {
  EditionOut as SeedEdition,
  EventOut as SeedEvent,
  ProductOut as SeedProduct,
  ProductInclusionOut as SeedProductInclusion,
} from "@/api-types";

/** Shared mutable in-memory stores for edition/event mocks. */
export const editions: EditionOut[] = structuredClone(seedEditions);
export const events: EventOut[] = structuredClone(seedEvents);

export function resetEditionStore(): void {
  editions.splice(0, editions.length, ...structuredClone(seedEditions));
  events.splice(0, events.length, ...structuredClone(seedEvents));
}

import { seedEditions, seedEvents } from "./editions";

/** Shared mutable in-memory stores for edition/event mocks. */
export const editions: Record<string, unknown>[] = structuredClone(seedEditions);
export const events: Record<string, unknown>[] = structuredClone(seedEvents);

export function resetEditionStore(): void {
  editions.splice(0, editions.length, ...structuredClone(seedEditions));
  events.splice(0, events.length, ...structuredClone(seedEvents));
}

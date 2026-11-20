/** Shared types and helpers for the edition management UI. */
import type { EditionOut } from "@/api-types";
export type EditionType = EditionOut["edition_type"];
export function parseEditionDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

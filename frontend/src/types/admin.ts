/**
 * Types for the admin floor plan and room management.
 */

/** An organization as the admin dashboard reads it from `GET /api/organizations`. */
export interface Organization {
  description_nl?: string | null;
  description_fr?: string | null;
  description_en?: string | null;

  id: number;
  name: string;
  active: boolean;
  /** The person who is the organization's contact; repointed by a people merge. */
  contactPersonId: string | null;
}

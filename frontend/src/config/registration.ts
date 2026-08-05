/**
 * Constants for the VIP registration and ordering system.
 *
 * Products used to be a hardcoded catalog here; they are now real,
 * event-scoped `Product` records read from `event.products` (see
 * `@/types/event`) and managed per-event in the admin dashboard.
 */

export const MAX_GUESTS = 20;
export const MIN_GUESTS = 1;

/** Minimum seconds between form load and submission (bot protection) */
export const MIN_FORM_SECONDS = 3;

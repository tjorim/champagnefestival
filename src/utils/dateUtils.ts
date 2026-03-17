/**
 * Centralized dayjs configuration and date utility helpers.
 *
 * Import `dayjs` and any helper functions from here rather than importing
 * directly from the `dayjs` package, so that locale data is loaded exactly
 * once and shared across the whole app.
 */

import dayjs from "dayjs";
import "dayjs/locale/nl";
import "dayjs/locale/fr";

// Export the configured dayjs instance for use across the app.
export { dayjs };

/**
 * Returns a native `Date` set to the very end of the same calendar day
 * (23:59:59.999).
 */
export const endOfDay = (date: Date): Date => dayjs(date).endOf("day").toDate();

/**
 * Returns the full localised month name for the given date.
 *
 * @param date   - The date whose month should be formatted.
 * @param locale - A dayjs-compatible locale string, e.g. `"en"`, `"nl"`, `"fr"`.
 *
 * @example
 * localizedMonthName(new Date(2026, 2, 13), "nl") // "maart"
 * localizedMonthName(new Date(2026, 2, 13), "fr") // "mars"
 */
export const localizedMonthName = (date: Date, locale: string): string =>
  dayjs(date).locale(locale).format("MMMM");

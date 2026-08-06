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
export const localizedMonthName = (date: Date, locale: "en" | "fr" | "nl"): string =>
  dayjs(date).locale(locale).format("MMMM");

export const toLocalDateKey = (date: Date): string => dayjs(date).format("YYYY-MM-DD");

/**
 * Formats a festival's dates as a human-readable range, e.g. "2-3-4 October 2026"
 * (or "2-3-4 oktober 2026" in Dutch) when every date falls in the same month.
 * Dates spanning two months fall back to "D MMMM – D MMMM YYYY".
 *
 * @param dates  - The festival's dates, in chronological order.
 * @param locale - A dayjs-compatible locale string, e.g. `"en"`, `"nl"`, `"fr"`.
 */
export function formatDateRange(dates: Date[], locale: "en" | "fr" | "nl"): string {
  if (dates.length === 0) return "";

  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const sameMonth = dates.every(
    (d) => dayjs(d).month() === dayjs(first).month() && dayjs(d).year() === dayjs(first).year(),
  );

  if (sameMonth) {
    const days = dates.map((d) => dayjs(d).date());
    const monthName = localizedMonthName(first, locale);
    const year = dayjs(first).year();
    return locale === "en"
      ? `${monthName} ${days.join("-")}, ${year}`
      : `${days.join("-")} ${monthName} ${year}`;
  }

  return `${dayjs(first).locale(locale).format("D MMMM")} – ${dayjs(last).locale(locale).format("D MMMM YYYY")}`;
}

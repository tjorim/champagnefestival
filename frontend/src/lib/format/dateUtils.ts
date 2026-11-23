/**
 * Centralized dayjs configuration and date utility helpers.
 *
 * Import `dayjs` and any helper functions from here rather than importing
 * directly from the `dayjs` package, to share calendar handling across the app.
 */

import dayjs from "dayjs";

// Export the configured dayjs instance for use across the app.
export { dayjs };

/**
 * Returns a native `Date` set to the very end of the same calendar day
 * (23:59:59.999).
 */
export const endOfDay = (date: Date): Date => dayjs(date).endOf("day").toDate();

/** Use British English for display while keeping the interface language codes unchanged. */
export const displayLocale = (locale: string): string => (locale === "en" ? "en-GB" : locale);

export const toLocalDateKey = (date: Date): string => dayjs(date).format("YYYY-MM-DD");

type DateValue = Date | string | number;

function parseDate(value: DateValue): Date {
  if (value instanceof Date) return value;
  // Calendar dates from the API represent a day, independent of the viewer's time zone.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

function format(value: DateValue, locale: string, options: Intl.DateTimeFormatOptions): string {
  const date = parseDate(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(displayLocale(locale), options).format(date);
}

export function formatDate(
  value: DateValue,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return format(value, locale, options);
}

export function formatDateTime(value: DateValue, locale: string): string {
  return format(value, locale, { dateStyle: "medium", timeStyle: "medium" });
}

/** API clock times have no zone. Anchor them in UTC so formatting preserves the wall time. */
export function formatTime(value: DateValue, locale: string): string {
  if (typeof value === "string" && /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) {
    const date = new Date(`2000-01-01T${value}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return format(date, locale, { timeStyle: "short", timeZone: "UTC" });
  }
  return format(value, locale, { timeStyle: "medium" });
}

/** Keep the individual days visible when an edition's dates fall in one month. */
export function formatDateRange(dates: readonly DateValue[], locale: string): string {
  if (dates.length === 0) return "";
  const options = { day: "numeric", month: "long", year: "numeric" } as const;
  if (dates.length === 1) return formatDate(dates[0]!, locale, options);

  const parsed = dates.map(parseDate);
  if (parsed.some((date) => Number.isNaN(date.getTime()))) {
    return dates.map((date) => formatDate(date, locale, options)).join(" – ");
  }
  parsed.sort((left, right) => left.getTime() - right.getTime());
  const first = parsed[0]!;
  const last = parsed[parsed.length - 1]!;
  const intlLocale = displayLocale(locale);
  const formatter = new Intl.DateTimeFormat(intlLocale, options);
  if (
    parsed.every(
      (date) => date.getMonth() === first.getMonth() && date.getFullYear() === first.getFullYear(),
    )
  ) {
    const dayFormatter = new Intl.DateTimeFormat(intlLocale, { day: "numeric" });
    const days = parsed.map((date) => dayFormatter.format(date)).join("-");
    return formatter
      .formatToParts(first)
      .map(({ type, value }) => (type === "day" ? days : value))
      .join("");
  }
  return formatter.formatRange(first, last);
}

import { displayLocale } from "./dateUtils";

const defaultFormatters = new Map<string, Intl.NumberFormat>();

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  const tag = displayLocale(locale);
  if (options) return new Intl.NumberFormat(tag, options).format(value);

  let formatter = defaultFormatters.get(tag);
  if (!formatter) {
    formatter = new Intl.NumberFormat(tag);
    defaultFormatters.set(tag, formatter);
  }
  return formatter.format(value);
}

export function formatEuro(
  value: number | string,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return formatNumber(Number(value), locale, { style: "currency", currency: "EUR", ...options });
}

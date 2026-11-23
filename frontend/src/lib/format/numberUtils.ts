import { displayLocale } from "./dateUtils";

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(displayLocale(locale), options).format(value);
}

export function formatEuro(
  value: number | string,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return formatNumber(Number(value), locale, { style: "currency", currency: "EUR", ...options });
}

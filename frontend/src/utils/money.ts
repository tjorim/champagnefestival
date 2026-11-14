/**
 * Money arrives from the API as an exact decimal string (`"12.50"`) so nothing is lost to floats in transit.
 * Convert it with this where an amount is added, compared or formatted; a missing amount counts as zero.
 */
export function toAmount(value: string | null | undefined): number {
  return value == null ? 0 : Number(value);
}

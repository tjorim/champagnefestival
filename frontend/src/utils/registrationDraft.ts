import type { Product } from "@/types/event";

/**
 * Product rules for a booking being drafted by an organiser. They mirror the
 * backend's `resolve_booking`: when an event has required products, an order
 * with products must include at least one of them, while an empty order is an
 * accepted admin exemption (the dialog asks for it to be confirmed).
 */

export type ProductQuantities = Record<string, number>;

/**
 * Quantities the organiser has not touched: a single required per-person
 * ticket follows the party size, so a two-person booking starts as two tickets.
 */
export function suggestedQuantities(products: Product[], guestCount: number): ProductQuantities {
  const required = products.filter((product) => product.required);
  const [only] = required;
  if (required.length !== 1 || only?.unit !== "person") return {};
  return Number.isInteger(guestCount) && guestCount > 0 ? { [only.id]: guestCount } : {};
}

/** Suggested quantities with the organiser's own entries applied on top. */
export function resolveQuantities(
  products: Product[],
  overrides: ProductQuantities,
  guestCount: number,
): ProductQuantities {
  const suggested = suggestedQuantities(products, guestCount);
  return Object.fromEntries(
    products.map((product) => [product.id, overrides[product.id] ?? suggested[product.id] ?? 0]),
  );
}

export function draftTotal(products: Product[], quantities: ProductQuantities): number {
  return products.reduce((sum, product) => sum + (quantities[product.id] ?? 0) * product.price, 0);
}

export interface ProductDraftState {
  required: Product[];
  selected: Product[];
  /** Required products exist but none is ordered: the booking is complimentary or exempt. */
  exempt: boolean;
  /** Only optional products are ordered, which the backend rejects. */
  missingRequired: boolean;
}

export function productDraftState(
  products: Product[],
  quantities: ProductQuantities,
): ProductDraftState {
  const required = products.filter((product) => product.required);
  const selected = products.filter((product) => (quantities[product.id] ?? 0) > 0);
  const hasRequired = selected.some((product) => product.required);
  return {
    required,
    selected,
    exempt: required.length > 0 && selected.length === 0,
    missingRequired: required.length > 0 && selected.length > 0 && !hasRequired,
  };
}

export function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 0 && quantity <= 1000;
}

export function isValidGuestCount(guestCount: number): boolean {
  return Number.isInteger(guestCount) && guestCount >= 1 && guestCount <= 20;
}

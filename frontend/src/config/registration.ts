/**
 * Products and constants for the VIP registration and ordering system.
 */
import type { Product } from "@/types/registration";

export const MAX_GUESTS = 20;
export const MIN_GUESTS = 1;

/** Minimum seconds between form load and submission (bot protection) */
export const MIN_FORM_SECONDS = 3;

export const CHAMPAGNE_PRODUCTS: Product[] = [
  {
    id: "champagne-standard",
    nameKey: "champagne_standard",
    price: 65,
    category: "champagne",
    available: true,
  },
  {
    id: "champagne-prestige",
    nameKey: "champagne_prestige",
    price: 120,
    category: "champagne",
    available: true,
  },
  {
    id: "champagne-glass",
    nameKey: "champagne_glass",
    price: 12,
    category: "champagne",
    available: true,
  },
];

export const FOOD_PRODUCTS: Product[] = [
  {
    id: "food-cheese",
    nameKey: "food_cheese",
    price: 25,
    category: "food",
    available: true,
  },
  {
    id: "food-charcuterie",
    nameKey: "food_charcuterie",
    price: 20,
    category: "food",
    available: true,
  },
];

export const ALL_PRODUCTS: Product[] = [...CHAMPAGNE_PRODUCTS, ...FOOD_PRODUCTS];

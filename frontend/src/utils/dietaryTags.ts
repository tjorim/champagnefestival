import { m } from "@/paraglide/messages";

/** What a meal suits or contains (mirrors `DietaryTag` in the backend schemas). */
export type DietaryTag = "vegetarian" | "vegan" | "gluten_free" | "lactose_free" | "contains_nuts";

const LABELS: Record<DietaryTag, () => string> = {
  vegetarian: () => m.poll_dietary_vegetarian(),
  vegan: () => m.poll_dietary_vegan(),
  gluten_free: () => m.poll_dietary_gluten_free(),
  lactose_free: () => m.poll_dietary_lactose_free(),
  contains_nuts: () => m.poll_dietary_contains_nuts(),
};

export function dietaryTagLabel(tag: DietaryTag): string {
  return LABELS[tag]();
}

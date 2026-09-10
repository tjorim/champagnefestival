import type { OrderItemCategory } from "./registration";

export interface EventEditionSummary {
  id: string;
  year: number;
  month: string;
  editionType: "festival" | "bourse" | "capsule_exchange";
  active: boolean;
}

/**
 * Something guests can order when registering for this event (a bottle of
 * champagne, a cheese platter, ...). Scoped to one event — there is no global
 * catalog, since what a VIP tasting sells has nothing to do with what a
 * different tasting or a bourse would.
 */
export interface ProductInclusion {
  product_id: string;
  quantity: number;
  per_quantity: number;
  rounding: "up" | "down";
  /** Whether this inclusion appears in the visitor-facing order summary. */
  visible: boolean;
}

/**
 * "purchasable": visible in the registration form and orderable standalone.
 * "included_visible": unavailable standalone but shown when a package
 * includes it (subject to that inclusion's own `visible` flag).
 * "internal": unavailable standalone and never shown to visitors, though it
 * still counts toward stock and preparation totals.
 * "disabled": kept for later reuse; unavailable for new sales or packages.
 */
export type ProductMode = "purchasable" | "included_visible" | "internal" | "disabled";

export interface Product {
  unit?: "item" | "table" | "person";
  stock?: number | null;
  reservedQuantity?: number;
  availableQuantity?: number | null;
  shortage?: number;
  /** A purchasable product with no remaining stock — distinct from `mode`. */
  soldOut?: boolean;
  inclusions?: ProductInclusion[] | null;
  id: string;
  eventId: string;
  name: string;
  /** Short, optional blurb shown alongside the product name. */
  description: string;
  price: number;
  category: OrderItemCategory;
  mode: ProductMode;
  /**
   * A prerequisite product for this event (e.g. an entry ticket). An order
   * that includes any non-required product for an event with required
   * products must also include at least one required one.
   */
  required: boolean;
  /**
   * Together, these bundle a free quantity of another product on this event
   * into this one — e.g. one champagne bottle per two guests with a VIP
   * table. Only meaningful as a pair.
   */
  includedProductId?: string;
  includedPerGuests?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: string;
  editionId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime?: string;
  category: string;
  registrationRequired: boolean;
  registrationsOpenFrom?: string;
  registrationsCloseAt?: string;
  maxCapacity?: number;
  sortOrder?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  edition?: EventEditionSummary | null;
  /**
   * Selectable ("purchasable") products, plus the name/description of any
   * "included_visible" product bundled into one of them (`mode` reflects
   * this — see `Product`). "internal"/"disabled" products never appear
   * here. Whether guests can order anything for this event is answered by
   * whether any entry has `mode === "purchasable"`, not by a separate flag.
   */
  products: Product[];
}

export interface EventFormData {
  editionId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  category: string;
  registrationRequired: boolean;
  registrationsOpenFrom: string;
  registrationsCloseAt: string;
  maxCapacity: string;
  sortOrder: string;
  active: boolean;
}

function isOrderItemCategory(value: unknown): value is OrderItemCategory {
  return value === "champagne" || value === "food" || value === "other";
}

function isProductMode(value: unknown): value is ProductMode {
  return (
    value === "purchasable" ||
    value === "included_visible" ||
    value === "internal" ||
    value === "disabled"
  );
}

/**
 * The admin API returns a `mode` on every product. The public API (visitor
 * registration flow) never exposes `mode` or internal/disabled products —
 * only a `purchasable` boolean, so a product present in that response is
 * either purchasable or (the only other possibility) included_visible.
 */
function resolveProductMode(data: Record<string, unknown>): ProductMode {
  if (isProductMode(data.mode)) return data.mode;
  return data.purchasable ? "purchasable" : "included_visible";
}

export function apiToProduct(data: Record<string, unknown>): Product {
  return {
    id: String(data.id ?? ""),
    eventId: String(data.event_id ?? ""),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    price: Number(data.price ?? 0),
    category: isOrderItemCategory(data.category) ? data.category : "other",
    mode: resolveProductMode(data),
    soldOut: Boolean(data.sold_out),
    required: Boolean(data.required),
    unit: data.unit === "table" || data.unit === "person" ? data.unit : "item",
    stock: typeof data.stock === "number" ? data.stock : null,
    reservedQuantity: Number(data.reserved_quantity ?? 0),
    availableQuantity: typeof data.available_quantity === "number" ? data.available_quantity : null,
    shortage: Number(data.shortage ?? 0),
    inclusions: Array.isArray(data.inclusions)
      ? (data.inclusions as ProductInclusion[]).map((inclusion) => ({
          ...inclusion,
          visible: inclusion.visible ?? true,
        }))
      : null,
    includedProductId:
      typeof data.included_product_id === "string" ? data.included_product_id : undefined,
    includedPerGuests:
      typeof data.included_per_guests === "number" ? data.included_per_guests : undefined,
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
}

export function apiToEvent(data: Record<string, unknown>): Event {
  const rawEdition =
    typeof data.edition === "object" && data.edition !== null
      ? (data.edition as Record<string, unknown>)
      : null;
  const rawProducts = Array.isArray(data.products) ? data.products : [];

  return {
    id: String(data.id ?? ""),
    editionId: String(data.edition_id ?? ""),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    date: String(data.date ?? ""),
    startTime: String(data.start_time ?? ""),
    endTime: typeof data.end_time === "string" ? data.end_time : undefined,
    category: String(data.category ?? ""),
    registrationRequired: Boolean(data.registration_required),
    registrationsOpenFrom:
      typeof data.registrations_open_from === "string" ? data.registrations_open_from : undefined,
    registrationsCloseAt:
      typeof data.registrations_close_at === "string" ? data.registrations_close_at : undefined,
    maxCapacity: typeof data.max_capacity === "number" ? data.max_capacity : undefined,
    sortOrder: typeof data.sort_order === "number" ? data.sort_order : undefined,
    active: Boolean(data.active),
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
    products: rawProducts
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .map(apiToProduct),
    edition: rawEdition
      ? {
          id: String(rawEdition.id ?? ""),
          year: Number(rawEdition.year ?? 0),
          month: String(rawEdition.month ?? ""),
          editionType:
            rawEdition.edition_type === "bourse" || rawEdition.edition_type === "capsule_exchange"
              ? rawEdition.edition_type
              : "festival",
          active: Boolean(rawEdition.active),
        }
      : null,
  };
}

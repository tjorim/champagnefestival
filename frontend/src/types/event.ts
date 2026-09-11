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
}

export interface Product {
  unit?: "item" | "table" | "person";
  stock?: number | null;
  reservedQuantity?: number;
  availableQuantity?: number | null;
  shortage?: number;
  /** A purchasable product with no remaining stock — distinct from `purchasable`. */
  soldOut?: boolean;
  inclusions?: ProductInclusion[] | null;
  id: string;
  eventId: string;
  name: string;
  /** Short, optional blurb shown alongside the product name. */
  description: string;
  price: number;
  category: OrderItemCategory;
  /**
   * Whether this product can be ordered standalone and is ever named to a
   * visitor — see #1020. A `purchasable: false` ("hidden") product can still
   * be an inclusion target of another product (bundled quantity, stock and
   * preparation totals are unaffected either way), but it is never orderable
   * directly and never named to a visitor, standalone or bundled.
   */
  purchasable: boolean;
  /**
   * A prerequisite product for this event (e.g. an entry ticket). An order
   * that includes any non-required product for an event with required
   * products must also include at least one required one. A required
   * product must be purchasable.
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
   * Purchasable products only — a hidden (`purchasable: false`) product
   * never appears here, even as a bundle target (see `Product.purchasable`).
   * Whether guests can order anything for this event is answered by whether
   * any entry exists at all, not by a separate flag.
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

export function apiToProduct(data: Record<string, unknown>): Product {
  return {
    id: String(data.id ?? ""),
    eventId: String(data.event_id ?? ""),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    price: Number(data.price ?? 0),
    category: isOrderItemCategory(data.category) ? data.category : "other",
    purchasable: Boolean(data.purchasable),
    soldOut: Boolean(data.sold_out),
    required: Boolean(data.required),
    unit: data.unit === "table" || data.unit === "person" ? data.unit : "item",
    stock: typeof data.stock === "number" ? data.stock : null,
    reservedQuantity: Number(data.reserved_quantity ?? 0),
    availableQuantity: typeof data.available_quantity === "number" ? data.available_quantity : null,
    shortage: Number(data.shortage ?? 0),
    inclusions: Array.isArray(data.inclusions) ? (data.inclusions as ProductInclusion[]) : null,
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

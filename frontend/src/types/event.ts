import type { OrderItemCategory } from "./registration";

export interface EventEditionSummary {
  id: string;
  year: number;
  month: string;
  editionType: "festival" | "bourse" | "capsule_exchange";
  active: boolean;
}

/**
 * Something guests can pre-order when registering for this event (a bottle of
 * champagne, a cheese platter, ...). Scoped to one event — there is no global
 * catalog, since what a VIP tasting sells has nothing to do with what a
 * different tasting or a bourse would.
 */
export interface Product {
  id: string;
  eventId: string;
  name: string;
  price: number;
  category: OrderItemCategory;
  active: boolean;
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
  maxCapacity?: number;
  sortOrder?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  edition?: EventEditionSummary | null;
  /**
   * Active products only. Whether guests can pre-order anything for this event
   * is answered by whether this list is non-empty, not by a separate flag.
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
    price: Number(data.price ?? 0),
    category: isOrderItemCategory(data.category) ? data.category : "other",
    active: Boolean(data.active),
    required: Boolean(data.required),
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

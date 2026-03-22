import type {
  OrderItemCategory,
  PaymentStatus,
  Registration,
  RegistrationStatus,
} from "./registration";

/** Map a FastAPI snake_case registration response to the frontend camelCase Registration type. */
export function apiToRegistration(d: Record<string, unknown>): Registration {
  // Add runtime guards for API data
  const rawOrders = Array.isArray(d.pre_orders) ? d.pre_orders as Record<string, unknown>[] : [];
  const rawPerson = (typeof d.person === 'object' && d.person !== null) ? d.person as Record<string, unknown> : {};
  return {
    id: d.id as string,
    personId: (d.person_id ?? "") as string,
    person: {
      id: (rawPerson.id ?? "") as string,
      name: (rawPerson.name ?? "") as string,
      email: (rawPerson.email ?? "") as string,
      phone: (rawPerson.phone ?? "") as string,
    },
    eventId: (d.event_id ?? "") as string,
    eventTitle: (d.event_title ?? "") as string,
    guestCount: (d.guest_count ?? 1) as number,
    preOrders: rawOrders.map((item) => ({
      productId: (item.product_id ?? "") as string,
      name: (item.name ?? "") as string,
      quantity: (item.quantity ?? 1) as number,
      price: (item.price ?? 0) as number,
      category: (item.category ?? "other") as OrderItemCategory,
      delivered: (item.delivered ?? false) as boolean,
    })),
    notes: (d.notes ?? "") as string,
    accessibilityNote: (d.accessibility_note ?? "") as string,
    tableId: (d.table_id as string | undefined) ?? undefined,
    status: (d.status ?? "pending") as RegistrationStatus,
    paymentStatus: (d.payment_status ?? "unpaid") as PaymentStatus,
    checkedIn: (d.checked_in ?? false) as boolean,
    checkedInAt: (d.checked_in_at as string | undefined) ?? undefined,
    strapIssued: (d.strap_issued ?? false) as boolean,
    checkInToken: d.check_in_token as string | undefined,
    createdAt: (d.created_at ?? "") as string,
    updatedAt: (d.updated_at ?? "") as string,
  };
}
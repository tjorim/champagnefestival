import { apiToEvent } from "./event";
import type {
  LedgerTransaction,
  OrderItemCategory,
  PaymentStatus,
  PaymentTransaction,
  PaymentTransactionKind,
  Registration,
  RegistrationStatus,
} from "./registration";

/** Map a FastAPI snake_case payment-transaction response to the frontend camelCase type. */
export function apiToPaymentTransaction(d: Record<string, unknown>): PaymentTransaction {
  return {
    id: d.id as string,
    registrationId: d.registration_id as string,
    amount: Number(d.amount ?? 0),
    kind: (d.kind ?? "payment") as PaymentTransactionKind,
    effectiveDate: (d.effective_date ?? "") as string,
    recordedAt: (d.recorded_at ?? "") as string,
    recordedBy: (d.recorded_by ?? "") as string,
    reference: (d.reference as string | null | undefined) ?? null,
    note: (d.note as string | null | undefined) ?? null,
    reversedTransactionId: (d.reversed_transaction_id as string | null | undefined) ?? null,
  };
}

/** Map a FastAPI snake_case ledger-drill-down row (#1019) to the frontend camelCase type. */
export function apiToLedgerTransaction(d: Record<string, unknown>): LedgerTransaction {
  return {
    ...apiToPaymentTransaction(d),
    personName: (d.person_name ?? "") as string,
    eventTitle: (d.event_title ?? "") as string,
    editionLabel: (d.edition_label ?? "") as string,
  };
}

/** Map a FastAPI snake_case registration response to the frontend camelCase Registration type. */
export function apiToRegistration(d: Record<string, unknown>): Registration {
  const rawOrders = Array.isArray(d.order_items)
    ? (d.order_items as Record<string, unknown>[])
    : [];
  const rawPerson =
    typeof d.person === "object" && d.person !== null ? (d.person as Record<string, unknown>) : {};
  const rawEvent =
    typeof d.event === "object" && d.event !== null ? (d.event as Record<string, unknown>) : null;

  return {
    id: d.id as string,
    personId: (d.person_id ?? "") as string,
    person: {
      id: (rawPerson.id ?? "") as string,
      name: (rawPerson.name ?? "") as string,
      email: (rawPerson.email ?? "") as string,
      phone: (rawPerson.phone ?? "") as string,
      preferredLanguage:
        rawPerson.preferred_language === "nl" ||
        rawPerson.preferred_language === "fr" ||
        rawPerson.preferred_language === "en"
          ? rawPerson.preferred_language
          : null,
    },
    eventId: (d.event_id ?? "") as string,
    event: rawEvent ? apiToEvent(rawEvent) : null,
    guestCount: (d.guest_count ?? 1) as number,
    orderItems: rawOrders.map((item) => {
      const quantity = Number(item.quantity ?? 1);
      const quantitySafe = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
      const deliveredQuantityRaw =
        item.delivered_quantity ?? ((item.delivered ?? false) ? quantitySafe : 0);
      const deliveredQuantity = Number(deliveredQuantityRaw);
      const deliveredQuantitySafe = Number.isFinite(deliveredQuantity)
        ? Math.max(0, Math.min(quantitySafe, deliveredQuantity))
        : 0;

      const includedQuantityRaw = Number(item.included_quantity ?? 0);
      const includedQuantity = Number.isFinite(includedQuantityRaw)
        ? Math.max(0, Math.min(quantitySafe, includedQuantityRaw))
        : 0;

      return {
        productId: (item.product_id ?? "") as string,
        name: (item.name ?? "") as string,
        quantity: quantitySafe,
        deliveredQuantity: deliveredQuantitySafe,
        remainingQuantity: quantitySafe - deliveredQuantitySafe,
        price: (item.price ?? 0) as number,
        category: (item.category ?? "other") as OrderItemCategory,
        delivered: deliveredQuantitySafe === quantitySafe,
        includedQuantity,
        visible: item.visible !== false,
      };
    }),
    allocations: Array.isArray(d.allocations)
      ? d.allocations.map((a: Record<string, unknown>) => ({
          tableId: String(a.table_id),
          guestCount: Number(a.guest_count),
          exclusive: Boolean(a.exclusive),
        }))
      : [],
    bookedTableQuantity: Number(d.booked_table_quantity ?? 0),
    notes: (d.notes ?? "") as string,
    tableId: (d.table_id as string | undefined) ?? undefined,
    status: (d.status ?? "pending") as RegistrationStatus,
    paymentStatus: (d.payment_status ?? "unpaid") as PaymentStatus,
    // Serialized as a decimal string by the API to avoid float drift on money.
    amountDue: d.amount_due == null ? undefined : Number(d.amount_due),
    amountPaid: Number(d.amount_paid ?? 0),
    refundDue: Number(d.refund_due ?? 0),
    checkedIn: (d.checked_in ?? false) as boolean,
    checkedInAt: (d.checked_in_at as string | undefined) ?? undefined,
    strapIssued: (d.strap_issued ?? false) as boolean,
    checkInToken: d.check_in_token as string | undefined,
    createdAt: (d.created_at ?? "") as string,
    updatedAt: (d.updated_at ?? "") as string,
  };
}

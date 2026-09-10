import { m } from "@/paraglide/messages";

/** Localised "Payment"/"Refund" label derived from a ledger entry's amount
 * sign (#1019) — there's no stored kind, a positive amount is a payment and
 * a negative one is a refund. Shared between the booking editor's ledger
 * view and the edition/person ledger drill-down. */
export function transactionAmountLabel(amount: number): string {
  return amount < 0 ? m.admin_payment_reason_refund() : m.admin_payment_reason_payment();
}

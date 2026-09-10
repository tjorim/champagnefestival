import { m } from "@/paraglide/messages";
import type { PaymentTransactionKind } from "@/types/registration";

/** Localised label for a ledger entry's kind (#1019), shared between the
 * booking editor's Add-transaction form and the edition/person ledger
 * drill-down. */
export function transactionKindLabel(kind: PaymentTransactionKind): string {
  switch (kind) {
    case "refund":
      return m.admin_payment_reason_refund();
    case "correction":
      return m.admin_payment_reason_correction();
    default:
      return m.admin_payment_reason_payment();
  }
}

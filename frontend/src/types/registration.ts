export interface TableAllocation {
  tableId: string;
  guestCount: number;
  exclusive: boolean;
}

export interface BookingUpdate {
  guestCount: number;
  quantities: Record<string, number>;
  allocations: TableAllocation[];
  notes: string;
  status: RegistrationStatus;
}

export type PaymentTransactionKind = "payment" | "refund" | "correction";

/** One append-only payment-ledger entry against a booking (#1019). */
export interface PaymentTransaction {
  id: string;
  registrationId: string;
  amount: number;
  kind: PaymentTransactionKind;
  /** When the money actually moved (e.g. a bank-transfer date), YYYY-MM-DD. */
  effectiveDate: string;
  recordedAt: string;
  recordedBy: string;
  reference?: string | null;
  note?: string | null;
  /** The entry this refund/correction reverses, if any. */
  reversedTransactionId?: string | null;
}

/** Payload for recording one new ledger entry — never edits or deletes a prior one. */
export interface PaymentTransactionCreate {
  kind: PaymentTransactionKind;
  amount: number;
  effectiveDate: string;
  reference?: string;
  note?: string;
  reversedTransactionId?: string;
  /** Client-generated key so a retried submission cannot book/refund money twice. */
  idempotencyKey: string;
}

/**
 * Types for the VIP registration and ordering system.
 */

import type { Event } from "./event";

export type OrderItemCategory = "champagne" | "food" | "other";

export type RegistrationStatus = "pending" | "confirmed" | "cancelled";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  price: number;
  category: OrderItemCategory;
  /** Whether back-of-house has physically delivered/brought this item */
  delivered: boolean;
  /**
   * How many of `quantity` came free via a product bundle (e.g. bottles
   * included with a VIP table) — only `quantity - includedQuantity` is
   * billed at `price` per unit.
   */
  includedQuantity: number;
  /** Whether this line should appear in the visitor-facing order summary. */
  visible: boolean;
}

export interface PersonSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  preferredLanguage?: "nl" | "fr" | "en" | null;
}

export interface Registration {
  allocations?: TableAllocation[];
  bookedTableQuantity?: number;
  id: string;
  personId: string;
  person: PersonSummary;
  eventId: string;
  event?: Event | null;
  guestCount: number;
  orderItems: OrderItem[];
  notes: string;
  /** First allocated table for compact displays; allocations hold the complete seating. */
  tableId?: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  /**
   * What this booking owes in euro — e.g. a bourse table rental fee.
   * Recorded by an admin and settled offline; undefined means nothing is owed.
   */
  amountDue?: number;
  amountPaid?: number;
  refundDue?: number;
  /** Whether the guest has physically checked in at the entrance */
  checkedIn: boolean;
  checkedInAt?: string;
  /** Whether the guest has received their wristband/strap */
  strapIssued: boolean;
  /**
   * One-time token included in the QR code.
   * Never exposed to the general public listing; only in individual registration details.
   * Optional because the list endpoint omits it — only the admin detail endpoint returns it.
   */
  checkInToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationFormData {
  name: string;
  email: string;
  phone: string;
  preferredLanguage: "nl" | "fr" | "en";
  eventId: string;
  guestCount: number;
  orderItems: OrderItem[];
  notes: string;
  marketingOptIn: boolean;
  honeypot?: string;
  formStartTime: string;
}

export interface RegistrationFormErrors {
  name?: string;
  email?: string;
  phone?: string;
  eventId?: string;
  guestCount?: string;
}

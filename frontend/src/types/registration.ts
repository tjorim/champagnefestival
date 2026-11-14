import type { OrderAnswer } from "@/utils/orderQuestions";
import type { Event } from "./event";

export interface TableAllocation {
  tableId: string;
  guestCount: number;
  exclusive: boolean;
}

export interface BookingUpdate {
  orderAnswers?: OrderAnswer[];
  guestCount: number;
  quantities: Record<string, number>;
  allocations: TableAllocation[];
  notes: string;
  status: RegistrationStatus;
}

export type RegistrationStatus = "pending" | "confirmed" | "cancelled";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  price: number;
  category: string;
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
  orderAnswers?: OrderAnswer[];
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
  orderAnswers?: OrderAnswer[];
  name: string;
  email: string;
  phone: string;
  preferredLanguage: "nl" | "fr" | "en";
  eventId: string;
  guestCount: number;
  orderItems: OrderItem[];
  notes: string;
  newEditionsOptIn: boolean;
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

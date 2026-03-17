/**
 * Types for the VIP reservation and ordering system.
 */

export type OrderItemCategory = "champagne" | "food" | "other";

export type ReservationStatus = "pending" | "confirmed" | "cancelled";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface Product {
  id: string;
  /** Product name (used as i18n key suffix) */
  nameKey: string;
  price: number;
  category: OrderItemCategory;
  available: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  category: OrderItemCategory;
  /** Whether back-of-house has physically delivered/brought this item */
  delivered: boolean;
}

export interface Reservation {
  id: string;
  name: string;
  email: string;
  phone: string;
  eventId: string;
  eventTitle: string;
  guestCount: number;
  preOrders: OrderItem[];
  notes: string;
  tableId?: string;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  /** Whether the guest has physically checked in at the entrance */
  checkedIn: boolean;
  checkedInAt?: string;
  /** Whether the guest has received their wristband/strap */
  strapIssued: boolean;
  /**
   * One-time token included in the QR code.
   * Never exposed to the general public listing; only in individual reservation details.
   * Optional because the list endpoint omits it — only the admin detail endpoint returns it.
   */
  checkInToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationFormData {
  name: string;
  email: string;
  phone: string;
  eventId: string;
  guestCount: number;
  preOrders: OrderItem[];
  notes: string;
  honeypot?: string;
  formStartTime: string;
}

export interface ReservationFormErrors {
  name?: string;
  email?: string;
  phone?: string;
  eventId?: string;
  guestCount?: string;
}

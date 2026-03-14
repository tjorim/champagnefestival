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
  createdAt: string;
  updatedAt: string;
}

export interface Table {
  id: string;
  name: string;
  capacity: number;
  /** X position (percentage of hall width) */
  x: number;
  /** Y position (percentage of hall height) */
  y: number;
  reservationIds: string[];
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

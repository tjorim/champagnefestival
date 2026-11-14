import type {
  OrderItemOut,
  OrderItemRequest,
  RegistrationListOut,
  TableAllocation,
} from "@/api-types";
import type { OrderAnswer } from "@/utils/orderQuestions";
import type { Event } from "./event";

export interface BookingUpdate {
  orderAnswers?: OrderAnswer[];
  guestCount: number;
  quantities: Record<string, number>;
  /** Typed as the API's own allocation (`table_id`, `guest_count`), so it is sent as it is. */
  allocations: TableAllocation[];
  notes: string;
  status: RegistrationStatus;
}

export type RegistrationStatus = RegistrationListOut["status"];

export type PaymentStatus = RegistrationListOut["payment_status"];

/**
 * A booking as the admin screens read it: the generated list row, as the API sends it, with the nested
 * `event` still in the camelCase `Event` shape until the event slice of #1657 replaces it (see
 * `registrationMapper.ts`). `check_in_token` exists only on the admin detail response.
 */
export type Registration = Omit<RegistrationListOut, "event"> & {
  event: Event | null;
  check_in_token?: string;
};

/**
 * What is still to be delivered on an order line. The API guarantees `0 <= delivered_quantity <= quantity`
 * (`OrderItemBase` rejects anything else), so this is plain subtraction.
 */
export function remainingQuantity(
  item: Pick<OrderItemOut, "quantity" | "delivered_quantity">,
): number {
  return item.quantity - item.delivered_quantity;
}

export interface RegistrationFormData {
  orderAnswers?: OrderAnswer[];
  name: string;
  email: string;
  phone: string;
  preferredLanguage: "nl" | "fr" | "en";
  eventId: string;
  guestCount: number;
  /** The lines the visitor ordered: what the API accepts (the server resolves name and price). */
  orderItems: OrderItemRequest[];
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

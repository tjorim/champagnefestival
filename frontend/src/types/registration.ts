import type {
  OrderItemOut,
  OrderItemRequest,
  RegistrationListOut,
  RegistrationOutWithToken,
  TableAllocation,
} from "@/api-types";
import type { OrderAnswer } from "@/lib/editions/orderQuestions";

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

/** Admin list/detail wire shapes; the token is present only in the detail response. */
export type Registration = Omit<RegistrationListOut, "table_names"> &
  Partial<Pick<RegistrationListOut, "table_names">> &
  Partial<Pick<RegistrationOutWithToken, "check_in_token">>;

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

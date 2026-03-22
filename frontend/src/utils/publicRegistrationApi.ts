import { m } from "@/paraglide/messages";
import type {
  OrderItemCategory,
  PaymentStatus,
  RegistrationFormData,
  RegistrationStatus,
} from "@/types/registration";

export interface CheckInData {
  id: string;
  name: string;
  eventId: string;
  eventTitle: string;
  guestCount: number;
  preOrders: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    category: OrderItemCategory;
    delivered: boolean;
  }[];
  notes: string;
  accessibilityNote: string;
  status: RegistrationStatus;
  checkedIn: boolean;
  checkedInAt?: string;
  strapIssued: boolean;
}

interface CheckInResponseRegistration {
  id?: string;
  name?: string;
  event_id?: string;
  event_title?: string;
  guest_count?: number;
  pre_orders?: Record<string, unknown>[];
  notes?: string;
  accessibility_note?: string;
  status?: RegistrationStatus;
  checked_in?: boolean;
  checked_in_at?: string;
  strap_issued?: boolean;
}

interface CheckInMutationResponse {
  registration?: CheckInResponseRegistration;
  already_checked_in?: boolean;
}

export class CheckInError extends Error {
  code: "not_found" | "invalid_token" | "request_failed";

  constructor(code: "not_found" | "invalid_token" | "request_failed", message: string) {
    super(message);
    this.code = code;
  }
}

function mapCheckInData(data: CheckInResponseRegistration): CheckInData {
  const rawOrders = (data.pre_orders ?? []) as Record<string, unknown>[];

  return {
    id: data.id ?? "",
    name: data.name ?? "",
    eventId: data.event_id ?? "",
    eventTitle: data.event_title ?? "",
    guestCount: data.guest_count ?? 1,
    preOrders: rawOrders.map((item) => ({
      productId: item.product_id as string,
      name: item.name as string,
      quantity: item.quantity as number,
      price: item.price as number,
      category: item.category as OrderItemCategory,
      delivered: (item.delivered ?? false) as boolean,
    })),
    notes: data.notes ?? "",
    accessibilityNote: data.accessibility_note ?? "",
    status: data.status ?? "pending",
    checkedIn: data.checked_in ?? false,
    checkedInAt: data.checked_in_at,
    strapIssued: data.strap_issued ?? false,
  };
}

export async function fetchCheckInRegistration(
  registrationId: string,
  checkInToken: string,
): Promise<CheckInData> {
  const response = await fetch(
    `/api/check-in/${encodeURIComponent(registrationId)}?token=${encodeURIComponent(checkInToken)}`,
  );

  if (response.status === 401 || response.status === 404) {
    throw new CheckInError("not_found", m.checkin_not_found());
  }

  if (!response.ok) {
    throw new CheckInError("request_failed", m.checkin_error());
  }

  return mapCheckInData((await response.json()) as CheckInResponseRegistration);
}

export async function submitCheckIn(
  registrationId: string,
  checkInToken: string,
): Promise<{ registration: CheckInData; alreadyCheckedIn: boolean }> {
  const response = await fetch(`/api/check-in/${encodeURIComponent(registrationId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: checkInToken, issue_strap: true }),
  });

  if (response.status === 401) {
    throw new CheckInError("invalid_token", m.checkin_invalid_token());
  }

  if (!response.ok) {
    throw new CheckInError("request_failed", m.checkin_error());
  }

  const data = (await response.json()) as CheckInMutationResponse;
  return {
    registration: mapCheckInData(data.registration ?? {}),
    alreadyCheckedIn: data.already_checked_in ?? false,
  };
}

export interface GuestRegistration {
  id: string;
  eventTitle: string;
  guestCount: number;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  checkedIn: boolean;
  checkedInAt?: string;
  strapIssued: boolean;
  createdAt: string;
  preOrders: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    category: string;
    delivered: boolean;
  }[];
}

interface GuestOrderItemResponse {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
  category: string;
  delivered: boolean;
}

interface GuestRegistrationResponse {
  id: string;
  event_title: string;
  guest_count: number;
  status: RegistrationStatus;
  payment_status: PaymentStatus;
  checked_in: boolean;
  checked_in_at?: string | null;
  strap_issued: boolean;
  created_at: string;
  pre_orders: GuestOrderItemResponse[];
}

export interface RegistrationLookupRequestAcceptedResponse {
  ok: boolean;
  delivery_mode: "email";
  expires_in_minutes: number;
}

export class RegistrationLookupError extends Error {
  code: "invalid_email" | "invalid_token" | "request_failed";

  constructor(
    code: "invalid_email" | "invalid_token" | "request_failed",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export function isRegistrationLookupError(error: unknown): error is RegistrationLookupError {
  return error instanceof RegistrationLookupError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegistrationStatus(value: unknown): value is RegistrationStatus {
  return value === "pending" || value === "confirmed" || value === "cancelled";
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === "unpaid" || value === "partial" || value === "paid";
}

function isGuestOrderItemResponse(value: unknown): value is GuestOrderItemResponse {
  return (
    isRecord(value) &&
    typeof value.product_id === "string" &&
    typeof value.name === "string" &&
    typeof value.quantity === "number" &&
    typeof value.price === "number" &&
    typeof value.category === "string" &&
    typeof value.delivered === "boolean"
  );
}

function isGuestRegistrationResponse(value: unknown): value is GuestRegistrationResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.event_title === "string" &&
    typeof value.guest_count === "number" &&
    isRegistrationStatus(value.status) &&
    isPaymentStatus(value.payment_status) &&
    typeof value.checked_in === "boolean" &&
    (value.checked_in_at === undefined ||
      value.checked_in_at === null ||
      typeof value.checked_in_at === "string") &&
    typeof value.strap_issued === "boolean" &&
    typeof value.created_at === "string" &&
    Array.isArray(value.pre_orders) &&
    value.pre_orders.every(isGuestOrderItemResponse)
  );
}

function parseGuestRegistrationsResponse(value: unknown): GuestRegistrationResponse[] {
  if (!Array.isArray(value) || !value.every(isGuestRegistrationResponse)) {
    throw new Error("Invalid guest registrations response.");
  }
  return value;
}

function parseRegistrationLookupRequestAccepted(
  value: unknown,
): RegistrationLookupRequestAcceptedResponse {
  if (
    !isRecord(value) ||
    typeof value.ok !== "boolean" ||
    value.delivery_mode !== "email" ||
    typeof value.expires_in_minutes !== "number"
  ) {
    throw new Error("Invalid registration lookup request response.");
  }
  return {
    ok: value.ok,
    delivery_mode: value.delivery_mode,
    expires_in_minutes: value.expires_in_minutes,
  };
}

function mapGuestRegistrations(data: GuestRegistrationResponse[]): GuestRegistration[] {
  return data.map((registration) => ({
    id: registration.id,
    eventTitle: registration.event_title,
    guestCount: registration.guest_count,
    status: registration.status as RegistrationStatus,
    paymentStatus: registration.payment_status as PaymentStatus,
    checkedIn: registration.checked_in,
    checkedInAt: registration.checked_in_at ?? undefined,
    strapIssued: registration.strap_issued,
    createdAt: registration.created_at,
    preOrders: registration.pre_orders.map((item) => ({
      productId: item.product_id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      category: item.category,
      delivered: item.delivered,
    })),
  }));
}

export async function requestRegistrationLookup(
  email: string,
): Promise<RegistrationLookupRequestAcceptedResponse> {
  const response = await fetch("/api/registrations/my/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new RegistrationLookupError(
      response.status === 422 ? "invalid_email" : "request_failed",
      response.status === 422 ? m.my_reservations_invalid_email() : m.my_reservations_error(),
    );
  }

  return parseRegistrationLookupRequestAccepted(await response.json());
}

export async function fetchMyRegistrations(token: string): Promise<GuestRegistration[]> {
  const response = await fetch("/api/registrations/my/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new RegistrationLookupError(
      response.status === 401 ? "invalid_token" : "request_failed",
      response.status === 401 ? m.my_reservations_invalid_token() : m.my_reservations_error(),
    );
  }

  const data = parseGuestRegistrationsResponse(await response.json());
  return mapGuestRegistrations(data);
}

export class RegistrationSubmitError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function submitRegistration(
  payload: RegistrationFormData,
  registrableEvents: { id: string; title: string }[],
): Promise<void> {
  const selectedEvent = registrableEvents.find((event) => event.id === payload.eventId);
  const response = await fetch("/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      event_id: payload.eventId,
      event_title: selectedEvent?.title ?? payload.eventId,
      guest_count: payload.guestCount,
      pre_orders: payload.preOrders.map((order) => ({
        product_id: order.productId,
        name: order.name,
        quantity: order.quantity,
        price: order.price,
        category: order.category,
        delivered: order.delivered,
      })),
      notes: payload.notes,
      honeypot: payload.honeypot ?? "",
      form_start_time: payload.formStartTime,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new RegistrationSubmitError(
      (data as { error?: string }).error ?? m.reservation_error(),
    );
  }
}

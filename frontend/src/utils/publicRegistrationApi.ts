import type {
  CheckInGuestOut,
  CheckInOut,
  RegistrationGuestOut,
  OrderItemOut,
  VisitorSessionStatus as ApiVisitorSessionStatus,
} from "@/api-types";
import { apiErrorFromResponse, apiErrorMessage } from "@/utils/apiErrors";
import { orderAnswersBody } from "@/utils/orderQuestions";
import { m } from "@/paraglide/messages";
import type { PaymentStatus, RegistrationFormData, RegistrationStatus } from "@/types/registration";

export type CheckInData = CheckInGuestOut;

export class CheckInError extends Error {
  code: "not_found" | "invalid_token" | "request_failed";

  constructor(code: "not_found" | "invalid_token" | "request_failed", message: string) {
    super(message);
    this.code = code;
  }
}

export async function fetchCheckInRegistration(
  registrationId: string,
  checkInToken: string,
): Promise<CheckInData> {
  const response = await fetch(`/api/check-in/${encodeURIComponent(registrationId)}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: checkInToken }),
  });

  if (response.status === 401) {
    throw new CheckInError("invalid_token", m.checkin_invalid_token());
  }

  if (response.status === 404) {
    throw new CheckInError("not_found", m.checkin_not_found());
  }

  if (!response.ok) {
    throw new CheckInError(
      "request_failed",
      apiErrorMessage(await apiErrorFromResponse(response, m.checkin_error()), m.checkin_error()),
    );
  }

  return (await response.json()) as CheckInGuestOut;
}

export async function submitCheckIn(
  registrationId: string,
  checkInToken: string,
): Promise<CheckInOut> {
  const response = await fetch(`/api/check-in/${encodeURIComponent(registrationId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: checkInToken, issue_strap: false }),
  });

  if (response.status === 401) {
    throw new CheckInError("invalid_token", m.checkin_invalid_token());
  }

  if (!response.ok) {
    throw new CheckInError(
      "request_failed",
      apiErrorMessage(await apiErrorFromResponse(response, m.checkin_error()), m.checkin_error()),
    );
  }

  return (await response.json()) as CheckInOut;
}

export type GuestRegistration = RegistrationGuestOut;
type GuestRegistrationResponse = RegistrationGuestOut;
type GuestOrderItemResponse = OrderItemOut;

export type RegistrationLookupRequestAcceptedResponse =
  import("@/api-types").RegistrationLookupRequestAccepted;

export class RegistrationLookupError extends Error {
  code: "invalid_email" | "invalid_token" | "request_failed";

  constructor(code: "invalid_email" | "invalid_token" | "request_failed", message: string) {
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
    (value.delivered_quantity === undefined ||
      value.delivered_quantity === null ||
      typeof value.delivered_quantity === "number") &&
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
    (value.event_date === undefined ||
      value.event_date === null ||
      typeof value.event_date === "string") &&
    typeof value.check_in_token === "string" &&
    typeof value.guest_count === "number" &&
    isRegistrationStatus(value.status) &&
    isPaymentStatus(value.payment_status) &&
    typeof value.checked_in === "boolean" &&
    (value.checked_in_at === undefined ||
      value.checked_in_at === null ||
      typeof value.checked_in_at === "string") &&
    typeof value.strap_issued === "boolean" &&
    typeof value.created_at === "string" &&
    Array.isArray(value.order_items) &&
    value.order_items.every(isGuestOrderItemResponse)
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
  return value as RegistrationLookupRequestAcceptedResponse;
}

async function parseRegistrationLookupResponse(response: Response): Promise<GuestRegistration[]> {
  if (!response.ok) {
    throw new RegistrationLookupError(
      response.status === 401 ? "invalid_token" : "request_failed",
      response.status === 401 ? m.my_registrations_invalid_token() : m.my_registrations_error(),
    );
  }

  const data = parseGuestRegistrationsResponse(await response.json());
  return data;
}

export async function fetchOwnedRegistrations(accessToken: string): Promise<GuestRegistration[]> {
  const response = await fetch("/api/me/registrations", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return parseRegistrationLookupResponse(response);
}

/** Preview registrations under the caller's own verified email — read-only,
 * nothing is linked (#1044). Empty when the account has no verified email
 * on file, which is not an error. */
export async function fetchClaimableRegistrations(
  accessToken: string,
): Promise<GuestRegistration[]> {
  const response = await fetch("/api/me/registrations/claimable", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return parseRegistrationLookupResponse(response);
}

/** Link the registrations previewed by `fetchClaimableRegistrations` — only
 * called after the caller explicitly confirms it's them. */
export async function claimVerifiedEmailRegistrations(
  accessToken: string,
): Promise<GuestRegistration[]> {
  const response = await fetch("/api/me/registrations/claim-verified-email", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return parseRegistrationLookupResponse(response);
}

export async function requestBookingChange(
  registrationId: string,
  requestType: "change" | "cancellation",
  details: string,
  submissionId: string,
  accessToken?: string | null,
): Promise<void> {
  const response = await fetch(
    `/api/me/registrations/${encodeURIComponent(registrationId)}/request`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        submission_id: submissionId,
        request_type: requestType,
        details,
      }),
    },
  );
  if (!response.ok) throw new Error(m.my_registrations_request_change_error());
}

// --- Passwordless visitor "My orders" session (#953) -----------------------
//
// Distinct from the request/access pair above: redeeming a magic link here
// establishes a persistent HttpOnly-cookie session instead of a one-shot
// read, so a visitor can check back days or weeks later without a fresh
// email. No Authorization header and no explicit `credentials` option is
// needed on any of these — frontend and API are same-origin (in dev via the
// Vite proxy, in production per DEPLOYMENT.md), and fetch's default
// "same-origin" credentials mode already sends and stores cookies for
// same-origin requests.

export async function requestVisitorMagicLink(
  email: string,
): Promise<RegistrationLookupRequestAcceptedResponse> {
  const response = await fetch("/api/visitor-sessions/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new RegistrationLookupError(
      response.status === 422 ? "invalid_email" : "request_failed",
      response.status === 422 ? m.my_registrations_invalid_email() : m.my_registrations_error(),
    );
  }

  return parseRegistrationLookupRequestAccepted(await response.json());
}

export async function redeemVisitorMagicLink(token: string): Promise<GuestRegistration[]> {
  const response = await fetch("/api/visitor-sessions/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  return parseRegistrationLookupResponse(response);
}

export async function fetchOwnedRegistrationsViaSession(): Promise<GuestRegistration[]> {
  const response = await fetch("/api/me/registrations");
  return parseRegistrationLookupResponse(response);
}

export type VisitorSessionStatus = ApiVisitorSessionStatus;

export async function getVisitorSessionStatus(): Promise<VisitorSessionStatus> {
  const response = await fetch("/api/visitor-sessions/status");
  if (!response.ok) return { authenticated: false, expires_at: null };
  return (await response.json()) as VisitorSessionStatus;
}

export async function signOutVisitorSession(): Promise<void> {
  const response = await fetch("/api/visitor-sessions/sign-out", { method: "POST" });
  if (!response.ok) {
    // The caller must not clear local "signed in" state on a failed sign-out
    // — the server session and cookie are still valid, and showing the sign-in
    // form anyway would be misleading (PR #1012 review).
    throw new RegistrationLookupError("request_failed", m.my_registrations_error());
  }
}

export class RegistrationSubmitError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function submitRegistration(
  payload: RegistrationFormData,
  accessToken?: string | null,
): Promise<import("@/api-types").RegistrationPublicOut> {
  if (!navigator.onLine) throw new RegistrationSubmitError(m.public_offline_write());
  const response = await fetch("/api/registrations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      preferred_language: payload.preferredLanguage,
      event_id: payload.eventId,
      guest_count: payload.guestCount,
      // The server resolves name/price/category from the event's real products —
      // see OrderItemRequest in the backend schema — so only these two are sent.
      order_items: payload.orderItems.map((order) => ({
        product_id: order.product_id,
        quantity: order.quantity,
      })),
      notes: payload.notes,
      ...(payload.orderAnswers ? { order_answers: orderAnswersBody(payload.orderAnswers) } : {}),
      new_editions_opt_in: payload.newEditionsOptIn,
      honeypot: payload.honeypot ?? "",
      form_start_time: payload.formStartTime,
    }),
  });

  if (!response.ok) {
    throw new RegistrationSubmitError(
      apiErrorMessage(
        await apiErrorFromResponse(response, m.registration_error()),
        m.registration_error(),
      ),
    );
  }
  const data = (await response.json()) as import("@/api-types").RegistrationPublicOut;
  if (typeof data.id !== "string") throw new RegistrationSubmitError(m.registration_error());
  return data;
}

export interface WaitlistJoinPayload {
  productId: string;
  name: string;
  email: string;
  phone: string;
  guestCount: number;
  notes: string;
}

/** Ask to be contacted if a sold-out product frees up (POST /api/waitlist). */
export async function submitWaitlistEntry(
  payload: WaitlistJoinPayload,
  submissionId: string,
): Promise<void> {
  if (!navigator.onLine) throw new RegistrationSubmitError(m.public_offline_write());
  const response = await fetch("/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      submission_id: submissionId,
      product_id: payload.productId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone || null,
      guest_count: payload.guestCount,
      notes: payload.notes,
    }),
  });
  if (!response.ok) {
    throw new RegistrationSubmitError(
      apiErrorMessage(
        await apiErrorFromResponse(response, m.registration_waitlist_error()),
        m.registration_waitlist_error(),
      ),
    );
  }
}

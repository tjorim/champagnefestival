import { m } from "@/paraglide/messages";

/**
 * An error response from the backend.
 *
 * `message` is the English `detail` string (or the translated operation
 * fallback when the body has none). It is a developer diagnostic for logs and
 * tests, never interface copy: render it with {@link apiErrorMessage}, which
 * maps the stable `code` the backend sends next to `detail` to a translation.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, options: { status: number; code?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
  }
}

/**
 * Translations for the backend's stable error codes. A code is added here when
 * a surface can show it; an unknown code falls back to the caller's translated
 * operation message, so the backend can introduce codes ahead of the interface.
 */
const API_ERROR_MESSAGES: Record<string, () => string> = {
  volunteer_invalid_niss: () => m.my_eid_invalid_niss(),
  volunteer_invalid_eid: () => m.my_eid_invalid_eid(),
  volunteer_identity_conflict: () => m.my_eid_help(),
  stamp_reward_handed_out: () => m.stamp_error_handed_out(),
  stamp_card_has_successor: () => m.stamp_error_successor(),
  stamp_reward_pending: () => m.stamp_error_pending(),
  stamp_card_type_not_configured: () => m.stamp_error_type(),
  stamp_card_type_unavailable: () => m.stamp_error_type(),
  registration_has_stamp: () => m.stamp_error_history(),
  volunteer_event_poll_required: () => m.volunteer_event_poll_required(),
  poll_event_invalid: () => m.api_error_poll_event_invalid(),
  poll_event_link_locked: () => m.api_error_poll_event_link_locked(),
  poll_event_in_use: () => m.api_error_poll_event_in_use(),
  event_linked_to_poll: () => m.api_error_event_linked_to_poll(),
  poll_registration_locked: () => m.api_error_poll_registration_locked(),
  poll_registration_managed: () => m.api_error_poll_registration_managed(),
  poll_event_unavailable: () => m.api_error_poll_event_unavailable(),
  poll_registration_exists: () => m.api_error_poll_registration_exists(),
  volunteer_required: () => m.api_error_volunteer_required(),
  member_sign_in_required: () => m.member_sign_in_prompt(),
  membership_required: () => m.membership_required(),
  member_email_in_use: () => m.api_error_member_email_in_use(),
  order_question_in_use: () => m.api_error_order_question_in_use(),
  order_question_unavailable: () => m.api_error_order_question_unavailable(),
  network_error: () => m.admin_error_network(),
  rate_limited: () => m.api_error_rate_limited(),
  registration_not_found: () => m.api_error_registration_not_found(),
  registration_already_cancelled: () => m.api_error_registration_already_cancelled(),
  table_over_capacity: () => m.api_error_table_over_capacity(),
  table_exclusive_conflict: () => m.api_error_table_exclusive_conflict(),
  checked_in_cannot_cancel: () => m.api_error_checked_in_cannot_cancel(),
  payment_amount_zero: () => m.api_error_payment_amount_zero(),
  payment_reversal_target_invalid: () => m.api_error_payment_reversal_target_invalid(),
  payment_reversal_amount_invalid: () => m.api_error_payment_reversal_amount_invalid(),
  table_type_in_use: () => m.api_error_table_type_in_use(),
  venue_has_editions: () => m.api_error_venue_has_editions(),
  venue_has_rooms: () => m.api_error_venue_has_rooms(),
  room_has_layouts: () => m.api_error_room_has_layouts(),
  layout_has_tables: () => m.api_error_layout_has_tables(),
  table_has_registrations: () => m.api_error_table_has_registrations(),
  category_protected: () => m.api_error_category_protected(),
  category_in_use: () => m.api_error_category_in_use(),
  event_has_registrations: () => m.api_error_event_has_registrations(),
  pebble_token_invalid: () => m.api_error_pebble_token_invalid(),
  poll_question_closed: () => m.api_error_poll_question_closed(),
  poll_question_in_use: () => m.api_error_poll_question_in_use(),
  poll_option_in_use: () => m.api_error_poll_option_in_use(),
  organization_not_found: () => m.api_error_organization_not_found(),
  pending_logo_not_found: () => m.api_error_pending_logo_not_found(),
  organization_change_conflict: () => m.manager_change_conflict(),
  organization_change_not_found: () => m.api_error_organization_change_not_found(),
  organization_change_submission_reused: () => m.api_error_organization_change_submission_reused(),
};

export function hasApiErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

/**
 * The text to show a person for a failed operation: the translation of the
 * error's code when it has a known one, otherwise `fallback` (the translated
 * operation message). Never `error.message`, which is English diagnostics.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code) {
    const translate = API_ERROR_MESSAGES[error.code];
    if (translate) return translate();
  }
  return fallback;
}

/** Read the stable `code` from an error response body, ignoring anything that is not a string. */
export function codeFromErrorBody(body: unknown): string | undefined {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : undefined;
}

/** Build an {@link ApiError} from a failed response, reading its JSON body at most once. */
export async function apiErrorFromResponse(
  response: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => ({}));
  const detail = (body as { detail?: unknown } | null)?.detail;
  return new ApiError(typeof detail === "string" ? detail : fallbackMessage, {
    status: response.status,
    code: codeFromErrorBody(body),
  });
}

import { m } from "@/paraglide/messages";
import { apiErrorMessage, hasApiErrorCode } from "@/utils/apiErrors";

/**
 * Translations for the email category and consent error codes (#1408). They live here, not in
 * the shared map in `apiErrors.ts`, because only lazily loaded screens show them and the shared map
 * is part of the eager bundle.
 */
const EMAIL_CONSENT_ERRORS: Record<string, () => string> = {
  consent_confirmation_invalid: () => m.api_error_consent_confirmation_invalid(),
  email_category_unavailable: () => m.api_error_email_category_unavailable(),
  email_category_not_found: () => m.api_error_email_category_not_found(),
  email_category_exists: () => m.api_error_email_category_exists(),
  email_category_protected: () => m.api_error_email_category_protected(),
  email_category_in_use: () => m.api_error_email_category_in_use(),
  verified_email_required: () => m.api_error_verified_email_required(),
};

/** Like `apiErrorMessage`, additionally explaining the email category and consent error codes. */
export function emailConsentErrorMessage(error: unknown, fallback: string): string {
  for (const [code, translate] of Object.entries(EMAIL_CONSENT_ERRORS)) {
    if (hasApiErrorCode(error, code)) return translate();
  }
  return apiErrorMessage(error, fallback);
}

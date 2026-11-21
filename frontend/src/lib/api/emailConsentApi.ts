import type { EmailPreferenceOut, EmailPreferencesOut } from "@/api-types";
import { m } from "@/paraglide/messages";
import { apiErrorFromResponse } from "./apiErrors";

export type EmailPreference = EmailPreferenceOut;

export type EmailPreferences = EmailPreferencesOut;

export async function getEmailPreferences(
  accessToken: string | null | undefined,
  locale: string,
  signal?: AbortSignal,
): Promise<EmailPreferences> {
  const response = await fetch(`/api/me/email-preferences?locale=${encodeURIComponent(locale)}`, {
    signal,
    // An OIDC bearer token, or without one the emailed-link session cookie, authenticates this.
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) throw await apiErrorFromResponse(response, m.email_preferences_load_error());
  return response.json();
}

/** Absolute state per listed category; the others are left as they are. Safe to repeat. */
export async function updateEmailPreferences(
  accessToken: string | null | undefined,
  consents: Record<string, boolean>,
  locale: string,
): Promise<EmailPreferences> {
  const response = await fetch(`/api/me/email-preferences?locale=${encodeURIComponent(locale)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ consents }),
  });
  if (!response.ok) throw await apiErrorFromResponse(response, m.email_preferences_save_error());
  return response.json();
}

/** Activate the consent behind an emailed confirmation link. The link works once. */
export async function confirmEmailConsent(
  token: string,
  locale: string,
): Promise<import("@/api-types").EmailConsentConfirmedOut> {
  const response = await fetch("/api/email-consents/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, locale }),
  });
  if (!response.ok) throw await apiErrorFromResponse(response, m.email_consent_confirm_error());
  return response.json();
}

import { m } from "@/paraglide/messages";
import { apiErrorFromResponse } from "@/utils/apiErrors";

export interface EmailPreference {
  key: string;
  name: string;
  description: string | null;
  /** Sent by the application when something happens, not composed by an administrator. */
  automatic: boolean;
  consented: boolean;
  grantedAt: string | null;
}

export interface EmailPreferences {
  /** The verified address the preferences are for; `null` without one. */
  email: string | null;
  categories: EmailPreference[];
}

interface EmailPreferencesResponse {
  email: string | null;
  categories: {
    key: string;
    name: string;
    description: string | null;
    automatic: boolean;
    consented: boolean;
    granted_at: string | null;
  }[];
}

function toPreferences(data: EmailPreferencesResponse): EmailPreferences {
  return {
    email: data.email,
    categories: data.categories.map((category) => ({
      key: category.key,
      name: category.name,
      description: category.description,
      automatic: category.automatic,
      consented: category.consented,
      grantedAt: category.granted_at,
    })),
  };
}

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
  return toPreferences((await response.json()) as EmailPreferencesResponse);
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
  return toPreferences((await response.json()) as EmailPreferencesResponse);
}

/** Activate the consent behind an emailed confirmation link. The link works once. */
export async function confirmEmailConsent(
  token: string,
  locale: string,
): Promise<{ categoryName: string }> {
  const response = await fetch("/api/email-consents/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, locale }),
  });
  if (!response.ok) throw await apiErrorFromResponse(response, m.email_consent_confirm_error());
  const data = (await response.json()) as { category_name?: unknown };
  return { categoryName: typeof data.category_name === "string" ? data.category_name : "" };
}

import { m } from "@/paraglide/messages";

export type CommunicationLanguage = "nl" | "fr" | "en";

export async function getCommunicationPreference(
  accessToken: string,
): Promise<CommunicationLanguage | null> {
  const response = await fetch("/api/me/communication-preference", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(m.my_account_preference_error());
  const data = (await response.json()) as { preferred_language?: unknown };
  return data.preferred_language === "nl" ||
    data.preferred_language === "fr" ||
    data.preferred_language === "en"
    ? data.preferred_language
    : null;
}

export async function updateCommunicationPreference(
  accessToken: string,
  preferredLanguage: CommunicationLanguage,
): Promise<void> {
  const response = await fetch("/api/me/communication-preference", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ preferred_language: preferredLanguage }),
  });
  if (!response.ok) throw new Error(m.my_account_preference_error());
}

/** Delete the signed-in visitor's portal account (DELETE /api/me). */
export async function deleteMyAccount(accessToken: string): Promise<void> {
  const response = await fetch("/api/me", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.my_account_delete_error());
  }
}

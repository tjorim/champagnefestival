import { m } from "@/paraglide/messages";
import { apiErrorFromResponse } from "@/utils/apiErrors";

/** The category a mailed unsubscribe link ends consent for (#1407). Changes nothing. */
export async function getUnsubscribeCategory(
  token: string,
  locale: string,
  signal?: AbortSignal,
): Promise<import("@/api-types").MemberMailUnsubscribeCategoryOut> {
  const query = new URLSearchParams({ token, locale });
  const response = await fetch(`/api/mail/unsubscribe/category?${query}`, { signal });
  if (!response.ok) throw await apiErrorFromResponse(response, m.email_unsubscribe_error());
  return response.json();
}

/** End the consent the signed token names. Safe to repeat. */
export async function unsubscribeByToken(token: string): Promise<void> {
  const response = await fetch(`/api/mail/unsubscribe?${new URLSearchParams({ token })}`, {
    method: "POST",
  });
  if (!response.ok) throw await apiErrorFromResponse(response, m.email_unsubscribe_error());
}

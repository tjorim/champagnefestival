import { fetchVoidOrThrowWithUnauthorized } from "@/utils/adminApi";
import { m } from "@/paraglide/messages";

export interface VapidPublicKeyResponse {
  publicKey: string;
  enabled: boolean;
}

export async function getVapidPublicKey(): Promise<VapidPublicKeyResponse> {
  const response = await fetch("/api/push/vapid-public-key");
  if (!response.ok) throw new Error(m.push_error_generic());
  const data = (await response.json()) as { public_key: string; enabled: boolean };
  return { publicKey: data.public_key, enabled: data.enabled };
}

export interface PushSubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: "nl" | "fr" | "en";
  categories?: string[];
  eventIds?: string[];
}

export interface PushSubscriptionResult {
  id: string;
  categories: string[];
  eventIds: string[];
}

export async function subscribeToPush(input: PushSubscribeInput): Promise<PushSubscriptionResult> {
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: input.endpoint,
      keys: { p256dh: input.p256dh, auth: input.auth },
      locale: input.locale,
      categories: input.categories ?? ["system_test"],
      event_ids: input.eventIds ?? [],
    }),
  });
  if (!response.ok) throw new Error(m.push_error_generic());
  const data = (await response.json()) as { id: string; categories: string[]; event_ids: string[] };
  return { id: data.id, categories: data.categories, eventIds: data.event_ids };
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  const response = await fetch("/api/push/subscriptions/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw new Error(m.push_error_generic());
}

export async function sendTestPush(
  subscriptionId: string,
  authHeaders: Record<string, string>,
): Promise<void> {
  await fetchVoidOrThrowWithUnauthorized(
    "/api/push/test",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ subscription_id: subscriptionId }),
    },
    m.push_error_generic(),
  );
}

import { useCallback, useEffect, useState } from "react";
import { getVapidPublicKey, subscribeToPush, unsubscribeFromPush } from "@/utils/pushApi";
import { getLocale } from "@/paraglide/runtime";

/** Convert a base64url VAPID public key into the Uint8Array `pushManager.subscribe`'s
 * `applicationServerKey` expects — standard Web Push boilerplate. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.codePointAt(0) ?? 0);
}

export type PushSupportState = "unsupported" | "disabled" | "checking" | "ready";

interface UsePushSubscriptionResult {
  /** "unsupported": no browser/PushManager support. "disabled": VAPID isn't
   * configured server-side. "checking": still determining subscribed state.
   * "ready": subscribe/unsubscribe can be used. */
  state: PushSupportState;
  isSubscribed: boolean;
  isBusy: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

/** Manages the browser-side half of a Web Push subscription (#941): permission,
 * PushManager subscribe/unsubscribe, and syncing with the backend. Callers
 * render their own consent copy and opt-in UI around this — see
 * docs/decisions/941-web-push-foundation.md. */
export function usePushSubscription(): UsePushSubscriptionResult {
  const [state, setState] = useState<PushSupportState>("checking");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkSupport(): Promise<void> {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const vapid = await getVapidPublicKey().catch(() => ({ publicKey: "", enabled: false }));
      if (cancelled) return;
      if (!vapid.enabled || !vapid.publicKey) {
        setState("disabled");
        return;
      }
      setVapidPublicKey(vapid.publicKey);
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (cancelled) return;
      setIsSubscribed(existing !== null);
      setState("ready");
    }
    void checkSupport();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!vapidPublicKey) return;
    setIsBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // BufferSource wants a Uint8Array<ArrayBuffer> specifically; the one
        // returned above is typed Uint8Array<ArrayBufferLike> by lib.dom —
        // always a plain ArrayBuffer at runtime here, never SharedArrayBuffer.
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error("Incomplete push subscription from the browser.");
      }
      await subscribeToPush({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        locale: getLocale(),
      });
      setIsSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, [vapidPublicKey]);

  const unsubscribe = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await unsubscribeFromPush(endpoint);
      }
      setIsSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { state, isSubscribed, isBusy, error, subscribe, unsubscribe };
}

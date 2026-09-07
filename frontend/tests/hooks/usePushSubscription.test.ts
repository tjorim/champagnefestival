import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import * as pushApi from "@/utils/pushApi";

vi.mock("@/utils/pushApi");

const VAPID_PUBLIC_KEY = "BNJxw-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ";

function mockPushManager({
  existingSubscription = null,
}: {
  existingSubscription?: { endpoint: string } | null;
} = {}) {
  const endpoint = "https://push.example.com/subscription/abc123";
  const subscription = {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existingSubscription ? subscription : null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };
  const registration = { pushManager };

  Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  });

  return { pushManager, subscription };
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("usePushSubscription", () => {
  it("reports unsupported when the browser has no PushManager", async () => {
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("unsupported"));
    expect(result.current.isSubscribed).toBe(false);
  });

  it("reports disabled when the server has no VAPID key configured", async () => {
    mockPushManager();
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({ publicKey: "", enabled: false });

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("disabled"));
  });

  it("surfaces unsupported if the service worker never becomes ready", async () => {
    Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
    Object.defineProperty(navigator, "serviceWorker", {
      // navigator.serviceWorker.ready never rejects — it can hang forever
      // for a blocked/failed registration, which this test simulates.
      value: { ready: new Promise<never>(() => undefined) },
      configurable: true,
    });
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => usePushSubscription());
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();

    await waitFor(() => expect(result.current.state).toBe("unsupported"));
  });

  it("reports ready and not subscribed when supported with no existing subscription", async () => {
    mockPushManager();
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.isSubscribed).toBe(false);
  });

  it("detects an existing browser subscription on mount and reconciles it with the backend", async () => {
    mockPushManager({ existingSubscription: { endpoint: "https://push.example.com/existing" } });
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });
    vi.mocked(pushApi.subscribeToPush).mockResolvedValue({
      id: "sub-existing",
      categories: [],
      eventIds: [],
    });

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.isSubscribed).toBe(true);
    expect(pushApi.subscribeToPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.com/subscription/abc123" }),
    );
  });

  it("still becomes ready if the mount-time reconciliation call fails", async () => {
    mockPushManager({ existingSubscription: { endpoint: "https://push.example.com/existing" } });
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });
    vi.mocked(pushApi.subscribeToPush).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.isSubscribed).toBe(true);
  });

  it("subscribes and registers the subscription with the backend", async () => {
    const { pushManager } = mockPushManager();
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });
    vi.mocked(pushApi.subscribeToPush).mockResolvedValue({
      id: "sub-1",
      categories: ["system_test"],
      eventIds: [],
    });

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await result.current.subscribe();

    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(pushApi.subscribeToPush).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example.com/subscription/abc123",
        p256dh: "p256dh-key",
        auth: "auth-key",
      }),
    );
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error and leaves isSubscribed false when the backend rejects the subscribe", async () => {
    mockPushManager();
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });
    vi.mocked(pushApi.subscribeToPush).mockRejectedValue(new Error("Something went wrong."));

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await result.current.subscribe();

    expect(result.current.isSubscribed).toBe(false);
    await waitFor(() => expect(result.current.error).toBe("Something went wrong."));
  });

  it("unsubscribes both the browser subscription and the backend record", async () => {
    const { subscription } = mockPushManager({
      existingSubscription: { endpoint: "https://push.example.com/subscription/abc123" },
    });
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });
    vi.mocked(pushApi.unsubscribeFromPush).mockResolvedValue(undefined);

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    await result.current.unsubscribe();

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushApi.unsubscribeFromPush).toHaveBeenCalledWith(
      "https://push.example.com/subscription/abc123",
    );
    await waitFor(() => expect(result.current.isSubscribed).toBe(false));
  });

  it("retries only the backend delete, not the already-completed browser unsubscribe", async () => {
    const { subscription } = mockPushManager({
      existingSubscription: { endpoint: "https://push.example.com/subscription/abc123" },
    });
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });
    vi.mocked(pushApi.subscribeToPush).mockResolvedValue({
      id: "sub-1",
      categories: [],
      eventIds: [],
    });
    vi.mocked(pushApi.unsubscribeFromPush).mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    // First attempt: browser unsubscribe succeeds, backend delete fails.
    await result.current.unsubscribe();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.error).toBe("network error"));

    // Browser subscription is already gone — a second getSubscription() call
    // would return null, so the endpoint must be retained from the first
    // attempt rather than re-derived.
    subscription.unsubscribe.mockClear();
    vi.mocked(pushApi.unsubscribeFromPush).mockResolvedValueOnce(undefined);

    await result.current.unsubscribe();

    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(pushApi.unsubscribeFromPush).toHaveBeenLastCalledWith(
      "https://push.example.com/subscription/abc123",
    );
    await waitFor(() => expect(result.current.isSubscribed).toBe(false));
  });
});

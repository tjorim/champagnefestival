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

  it("detects an existing browser subscription on mount", async () => {
    mockPushManager({ existingSubscription: { endpoint: "https://push.example.com/existing" } });
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      publicKey: VAPID_PUBLIC_KEY,
      enabled: true,
    });

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
});

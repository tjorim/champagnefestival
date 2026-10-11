import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { m } from "@/paraglide/messages";
import { setLocale } from "@/paraglide/runtime";
import { usePushSubscription } from "@/hooks/usePushSubscription";

const subscription = {
  endpoint: "https://push.example.com/abc",
  toJSON: () => ({ endpoint: "https://push.example.com/abc", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

function stubBrowserPush() {
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(subscription),
    },
  };
  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  });
  return registration;
}

async function readyHook() {
  const hook = renderHook(() => usePushSubscription());
  await waitFor(() => expect(hook.result.current.state).toBe("ready"));
  return hook;
}

beforeEach(() => {
  setLocale("nl", { reload: false });
  stubBrowserPush();
  server.use(
    http.get("/api/push/vapid-public-key", () =>
      HttpResponse.json({ public_key: "AQAB", enabled: true }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
  setLocale("en", { reload: false });
});

describe("usePushSubscription errors", () => {
  it("shows the translation of a known error code, not the English detail", async () => {
    server.use(
      http.post("/api/push/subscriptions", () =>
        HttpResponse.json(
          { detail: "Too many requests. Please try again later.", code: "rate_limited" },
          { status: 429 },
        ),
      ),
    );
    const { result } = await readyHook();

    await act(() => result.current.subscribe());

    expect(result.current.error).toBe(m.api_error_rate_limited());
    expect(result.current.error).not.toContain("Too many requests");
    expect(result.current.isSubscribed).toBe(false);
  });

  it("falls back to the translated generic message for an unknown code", async () => {
    server.use(
      http.post("/api/push/subscriptions", () =>
        HttpResponse.json(
          { detail: "A brand new English rule.", code: "not_yet_translated" },
          { status: 400 },
        ),
      ),
    );
    const { result } = await readyHook();

    await act(() => result.current.subscribe());

    expect(result.current.error).toBe(m.push_error_generic());
  });

  it("does not leak an English browser error into the interface", async () => {
    const registration = stubBrowserPush();
    registration.pushManager.subscribe.mockRejectedValue(
      new DOMException("Registration failed - permission denied", "NotAllowedError"),
    );
    const { result } = await readyHook();

    await act(() => result.current.subscribe());

    expect(result.current.error).toBe(m.push_error_generic());
  });
});

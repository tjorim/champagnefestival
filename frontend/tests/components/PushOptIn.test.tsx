import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import PushOptIn from "@/components/PushOptIn";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { sendTestPush, subscribeToPush } from "@/utils/pushApi";

vi.mock("@/hooks/usePushSubscription");
vi.mock("@/utils/pushApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/pushApi")>()),
  subscribeToPush: vi.fn(),
  sendTestPush: vi.fn(),
}));

const baseHookState = {
  isSubscribed: false,
  isBusy: false,
  error: null,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PushOptIn", () => {
  it("renders nothing when the browser doesn't support push", () => {
    vi.mocked(usePushSubscription).mockReturnValue({ ...baseHookState, state: "unsupported" });
    const { container } = render(<PushOptIn />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the server has push disabled", () => {
    vi.mocked(usePushSubscription).mockReturnValue({ ...baseHookState, state: "disabled" });
    const { container } = render(<PushOptIn />);
    expect(container).toBeEmptyDOMElement();
  });

  it("requires the consent checkbox before the subscribe button is enabled", async () => {
    const subscribe = vi.fn();
    vi.mocked(usePushSubscription).mockReturnValue({ ...baseHookState, state: "ready", subscribe });
    const user = userEvent.setup();
    render(<PushOptIn />);

    const subscribeButton = screen.getByRole("button", { name: /enable notifications/i });
    expect(subscribeButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(subscribeButton).toBeEnabled();

    await user.click(subscribeButton);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("shows the subscribed state with an unsubscribe control", async () => {
    const unsubscribe = vi.fn();
    vi.mocked(usePushSubscription).mockReturnValue({
      ...baseHookState,
      state: "ready",
      isSubscribed: true,
      unsubscribe,
    });
    const user = userEvent.setup();
    render(<PushOptIn />);

    expect(screen.getByRole("status")).toHaveTextContent(/enabled/i);
    await user.click(screen.getByRole("button", { name: /disable notifications/i }));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not show a test-send button without authHeaders (public site)", () => {
    vi.mocked(usePushSubscription).mockReturnValue({
      ...baseHookState,
      state: "ready",
      isSubscribed: true,
    });
    render(<PushOptIn />);
    expect(screen.queryByRole("button", { name: /test/i })).not.toBeInTheDocument();
  });

  it("sends a test notification when authHeaders is provided (admin context)", async () => {
    vi.mocked(usePushSubscription).mockReturnValue({
      ...baseHookState,
      state: "ready",
      isSubscribed: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({
              toJSON: () => ({
                endpoint: "https://push.example.com/abc",
                keys: { p256dh: "p256dh-key", auth: "auth-key" },
              }),
            }),
          },
        }),
      },
      configurable: true,
    });
    vi.mocked(subscribeToPush).mockResolvedValue({ id: "sub-1", categories: [], eventIds: [] });
    vi.mocked(sendTestPush).mockResolvedValue(undefined);

    const authHeaders = vi.fn().mockReturnValue({ Authorization: "Bearer admin-token" });
    const user = userEvent.setup();
    render(<PushOptIn authHeaders={authHeaders} />);

    await user.click(screen.getByRole("button", { name: /test/i }));

    expect(await screen.findByText(/test notification sent/i)).toBeInTheDocument();
    expect(sendTestPush).toHaveBeenCalledWith("sub-1", { Authorization: "Bearer admin-token" });

    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("has no axe violations in the opt-in (unsubscribed) state", async () => {
    vi.mocked(usePushSubscription).mockReturnValue({ ...baseHookState, state: "ready" });
    const { container } = render(<PushOptIn />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations in the subscribed state", async () => {
    vi.mocked(usePushSubscription).mockReturnValue({
      ...baseHookState,
      state: "ready",
      isSubscribed: true,
    });
    const { container } = render(<PushOptIn />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

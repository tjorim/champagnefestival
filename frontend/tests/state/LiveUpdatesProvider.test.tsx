import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/contexts/AuthContext";
import { LiveUpdatesProvider } from "@/state/LiveUpdatesProvider";
import type { ConnectLiveStreamOptions, LiveEnvelope } from "@/utils/liveStream";
import { createTestQueryClientHarness } from "../utils/queryClient";

// ---------------------------------------------------------------------------
// Mock connectLiveStream so tests control when events arrive.
// ---------------------------------------------------------------------------

let capturedOptions: ConnectLiveStreamOptions | null = null;

vi.mock("@/utils/liveStream", () => ({
  connectLiveStream: vi.fn((options: ConnectLiveStreamOptions) => {
    capturedOptions = options;
    // Return a promise that resolves when the signal is aborted.
    return new Promise<void>((resolve) => {
      options.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }),
}));

// Patching needs a registered collection, which these tests don't stand up —
// so it's mocked, defaulting to "cannot patch" (the real behaviour here) and
// flipped on for the one test that exercises the patch branch.
let canPatch = false;

vi.mock("@/state/adminRegistrationsCollection", () => ({
  canPatchAdminRegistrationLiveEvent: () => canPatch,
  patchAdminRegistrationLiveEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnvelope(overrides: Partial<LiveEnvelope> = {}): LiveEnvelope {
  return {
    topic: "registration",
    action: "updated",
    scope: { edition_id: null, event_id: null, registration_id: "reg-1", table_id: null },
    keys: [["admin", "registrations"]],
    ts: "2026-05-28T18:00:00Z",
    id: "evt_1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LiveUpdatesProvider", () => {
  beforeEach(() => {
    canPatch = false;
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-user",
      roles: ["admin"],
      hasRole: vi.fn((role: string) => role === "admin"),
      getAccessToken: vi.fn().mockReturnValue("mock-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });
  });

  it("opens the live stream when authenticated", async () => {
    capturedOptions = null;
    const { Wrapper } = createTestQueryClientHarness();

    render(<LiveUpdatesProvider />, { wrapper: Wrapper });

    await waitFor(() => expect(capturedOptions).not.toBeNull());
    expect(capturedOptions!.url).toBe("/api/live/stream");
  });

  it("does not open the stream when not authenticated", async () => {
    capturedOptions = null;
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-user",
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue(null),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });

    const { Wrapper } = createTestQueryClientHarness();
    render(<LiveUpdatesProvider />, { wrapper: Wrapper });

    await new Promise((r) => setTimeout(r, 20));
    expect(capturedOptions).toBeNull();
  });

  it("calls invalidateQueries for each key in the envelope", async () => {
    capturedOptions = null;
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    render(<LiveUpdatesProvider />, { wrapper: Wrapper });
    await waitFor(() => expect(capturedOptions).not.toBeNull());

    const envelope = makeEnvelope({
      keys: [
        ["admin", "registrations"],
        ["admin", "tables"],
      ],
    });
    act(() => capturedOptions!.onInvalidate(envelope));

    expect(spy).toHaveBeenCalledWith({ queryKey: ["admin", "registrations"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["admin", "tables"] });
  });

  it("refreshes the check-in stats when a registration event is patched instead of invalidated", async () => {
    capturedOptions = null;
    canPatch = true;
    // Own client rather than the shared harness: that one sets gcTime to 0, so
    // an observer-less cache entry is collected before the event arrives.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    // The patch path only runs once the registrations query has succeeded.
    queryClient.setQueryData(["admin", "registrations"], []);
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    render(<LiveUpdatesProvider />, { wrapper: Wrapper });
    await waitFor(() => expect(capturedOptions).not.toBeNull());

    act(() => capturedOptions!.onInvalidate(makeEnvelope({ topic: "check_in" })));

    expect(spy).not.toHaveBeenCalledWith({ queryKey: ["admin", "registrations"] });
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["admin", "registrations", "checkin-stats"],
    });
  });

  it("calls invalidateQueries for all live keys on reconnect", async () => {
    capturedOptions = null;
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    render(<LiveUpdatesProvider />, { wrapper: Wrapper });
    await waitFor(() => expect(capturedOptions).not.toBeNull());

    act(() => capturedOptions!.onReconnect?.());

    // Must have invalidated at least registrations and tables.
    expect(spy).toHaveBeenCalledWith({ queryKey: expect.arrayContaining(["admin"]) });
  });

  it("passes getAccessToken to connectLiveStream", async () => {
    capturedOptions = null;
    const { Wrapper } = createTestQueryClientHarness();
    render(<LiveUpdatesProvider />, { wrapper: Wrapper });

    await waitFor(() => expect(capturedOptions).not.toBeNull());
    expect(capturedOptions!.getToken()).toBe("mock-access-token");
  });

  it("aborts the signal on unmount", async () => {
    capturedOptions = null;
    const { Wrapper } = createTestQueryClientHarness();
    const { unmount } = render(<LiveUpdatesProvider />, { wrapper: Wrapper });

    await waitFor(() => expect(capturedOptions).not.toBeNull());
    unmount();
    expect(capturedOptions!.signal.aborted).toBe(true);
  });
});

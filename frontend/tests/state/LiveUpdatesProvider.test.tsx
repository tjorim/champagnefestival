import { act, render, waitFor } from "@testing-library/react";
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
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      roles: ["admin"],
      hasRole: vi.fn((role: string) => role === "admin"),
      getAccessToken: vi.fn().mockReturnValue("mock-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
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
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue(null),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
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

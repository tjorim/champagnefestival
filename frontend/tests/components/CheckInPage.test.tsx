import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import CheckInPage from "@/components/CheckInPage";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    checkin_title: () => "Check-in",
    checkin_scan_prompt: () => "Scan a QR code to begin.",
    checkin_not_found: () => "Registration not found.",
    checkin_error: () => "Something went wrong.",
    checkin_invalid_token: () => "Invalid token.",
    checkin_looking_up: () => "Looking up registration...",
    checkin_success: () => "Checked in successfully!",
    checkin_strap_issued: () => "Strap issued.",
    checkin_already_in: () => "Already checked in at",
    checkin_event: () => "Event",
    checkin_guests: () => "Guests",
    checkin_pre_orders: () => "Pre-orders",
    checkin_do_checkin: () => "Check in now",
    admin_checked_in: () => "Checked in",
    admin_strap_issued: () => "Strap issued",
    admin_bottle_delivered: () => "Delivered",
    admin_bottle_not_delivered: () => "Pending",
  },
}));

describe("CheckInPage", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function renderPage(initialEntry = "/check-in?id=res_123&token=secure-token") {
    const rootRoute = createRootRoute();
    const checkInRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/check-in",
      validateSearch: (search: Record<string, unknown>) => ({
        id: typeof search.id === "string" ? search.id : undefined,
        token: typeof search.token === "string" ? search.token : undefined,
      }),
      component: CheckInPage,
    });
    const routeTree = rootRoute.addChildren([checkInRoute]);
    const memoryHistory = createMemoryHistory({ initialEntries: [initialEntry] });
    const router = createRouter({ routeTree, history: memoryHistory });
    await router.load();
    const Wrapper = createTestQueryClientWrapper();

    return render(<RouterProvider router={router} />, { wrapper: Wrapper });
  }

  it("loads the registration via the lookup query", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "res_123",
        name: "Taylor Guest",
        event_id: "event_1",
        event_title: "VIP Reception",
        guest_count: 2,
        pre_orders: [],
        notes: "",
        accessibility_note: "",
        status: "confirmed",
        checked_in: false,
        strap_issued: false,
      }),
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Taylor Guest")).toBeInTheDocument();
      expect(screen.getByText("VIP Reception")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/check-in/res_123/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "secure-token" }),
    });
  });

  it("submits check-in via the mutation", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "res_123",
          name: "Taylor Guest",
          event_id: "event_1",
          event_title: "VIP Reception",
          guest_count: 2,
          pre_orders: [],
          notes: "",
          accessibility_note: "",
          status: "confirmed",
          checked_in: false,
          strap_issued: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          already_checked_in: false,
          registration: {
            id: "res_123",
            name: "Taylor Guest",
            event_id: "event_1",
            event_title: "VIP Reception",
            guest_count: 2,
            pre_orders: [],
            notes: "",
            accessibility_note: "",
            status: "confirmed",
            checked_in: true,
            checked_in_at: "2026-03-22T09:45:00Z",
            strap_issued: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "res_123",
          name: "Taylor Guest",
          event_id: "event_1",
          event_title: "VIP Reception",
          guest_count: 2,
          pre_orders: [],
          notes: "",
          accessibility_note: "",
          status: "confirmed",
          checked_in: true,
          checked_in_at: "2026-03-22T09:45:00Z",
          strap_issued: true,
        }),
      });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check in now/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /check in now/i }));

    await waitFor(() => {
      expect(screen.getByText("Checked in successfully!")).toBeInTheDocument();
      expect(screen.getByText("Strap issued.")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/check-in/res_123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "secure-token", issue_strap: true }),
    });
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import CheckInPage from "@/components/CheckInPage";
import { server } from "@/mocks/server";
import { seedRegistrations } from "@/mocks/data/registrations";
import { createTestQueryClientWrapper } from "../utils/queryClient";

// Use the first seed registration — reg-01 (Alice Dupont, Grand Opening, not yet checked in).
const seedReg = seedRegistrations[0]!;
const SEED_REG_ID = seedReg.id;
const SEED_REG_TOKEN = seedReg.check_in_token;
const SEED_REG_NAME = seedReg.person.name;
const SEED_EVENT_TITLE = seedReg.event.title;

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
  async function renderPage(
    initialEntry = `/check-in?id=${SEED_REG_ID}&token=${SEED_REG_TOKEN}`,
  ) {
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
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText(SEED_REG_NAME)).toBeInTheDocument();
      expect(screen.getByText(SEED_EVENT_TITLE)).toBeInTheDocument();
    });
  });

  it("submits check-in via the mutation", async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check in now/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /check in now/i }));

    await waitFor(() => {
      expect(screen.getByText("Checked in successfully!")).toBeInTheDocument();
      expect(screen.getByText("Strap issued.")).toBeInTheDocument();
    });
  });

  it("shows an error when the token is invalid", async () => {
    server.use(
      http.post("/api/check-in/:id/lookup", () => HttpResponse.json(null, { status: 401 })),
    );

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Invalid token.")).toBeInTheDocument();
    });
  });

  it("shows an error when the registration is not found", async () => {
    server.use(
      http.post("/api/check-in/:id/lookup", () => HttpResponse.json(null, { status: 404 })),
    );

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Registration not found.")).toBeInTheDocument();
    });
  });
});

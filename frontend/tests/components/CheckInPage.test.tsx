import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
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
import { validateCheckInSearch } from "@/router";
import { createTestQueryClientHarness, createTestQueryClientWrapper } from "../utils/queryClient";

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
    checkin_table: () => "Table",
    checkin_pre_orders: () => "Pre-orders",
    checkin_do_checkin: () => "Check in now",
    checkin_actions_login_required: () => "Login for entrance actions.",
    checkin_actions_unauthorized: () => "Unauthorized entrance action.",
    checkin_manual_search_title: () => "Find guest manually",
    checkin_manual_search_login_required: () => "Volunteer login required.",
    checkin_manual_search_label: () => "Guest name or email",
    checkin_manual_search_placeholder: () => "Search by guest name or email…",
    checkin_manual_search_help: () => "PII-minimal results.",
    checkin_manual_search_min_chars: () => "Enter at least 2 characters to search.",
    checkin_manual_search_loading: () => "Searching registrations…",
    checkin_manual_search_no_results: () => "No matching registrations found.",
    checkin_manual_search_unauthorized: () => "Sign in as a volunteer or admin.",
    checkin_manual_not_checked_in: () => "Not checked in",
    checkin_search_error: () => "Could not search registrations.",
    admin_login_button: () => "Login",
    admin_checked_in: () => "Checked in",
    admin_strap_issued: () => "Strap issued",
    admin_issue_strap: () => "Issue strap",
    admin_bottle_delivered: () => "Delivered",
    admin_bottle_not_delivered: () => "Pending",
    admin_mark_delivered: () => "Mark as delivered",
    admin_mark_not_delivered: () => "Mark as not delivered",
    admin_error_update_registration: () => "Failed to update registration.",
  },
}));

describe("CheckInPage", () => {
  async function renderPage(initialEntry = `/check-in?id=${SEED_REG_ID}&token=${SEED_REG_TOKEN}`) {
    const rootRoute = createRootRoute();
    const checkInRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/check-in",
      validateSearch: validateCheckInSearch,
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
      expect(screen.getByText(new RegExp(SEED_EVENT_TITLE))).toBeInTheDocument();
      expect(screen.getByText("T1")).toBeInTheDocument();
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
      expect(screen.getByRole("button", { name: /issue strap/i })).toBeInTheDocument();
    });
  });

  it("invalidates the checked-in registration query after submitting", async () => {
    const rootRoute = createRootRoute();
    const checkInRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/check-in",
      validateSearch: validateCheckInSearch,
      component: CheckInPage,
    });
    const routeTree = rootRoute.addChildren([checkInRoute]);
    const memoryHistory = createMemoryHistory({
      initialEntries: [`/check-in?id=${SEED_REG_ID}&token=${SEED_REG_TOKEN}`],
    });
    const router = createRouter({ routeTree, history: memoryHistory });
    await router.load();
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(<RouterProvider router={router} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check in now/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /check in now/i }));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["check-in", SEED_REG_ID, SEED_REG_TOKEN],
      });
    });
  });

  it("searches and selects a registration when the QR code is unavailable", async () => {
    await renderPage("/check-in");

    expect(screen.getByText("Scan a QR code to begin.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Guest name or email"), {
      target: { value: SEED_REG_NAME },
    });

    await waitFor(() => {
      expect(screen.getByText(new RegExp(SEED_EVENT_TITLE))).toBeInTheDocument();
      expect(screen.getByText("Not checked in")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(SEED_REG_NAME));

    expect(screen.getByRole("button", { name: /check in now/i })).toBeInTheDocument();
  });

  it("submits manual check-in for a selected volunteer search result", async () => {
    await renderPage("/check-in");

    fireEvent.change(screen.getByLabelText("Guest name or email"), {
      target: { value: SEED_REG_NAME },
    });

    await waitFor(() => {
      expect(screen.getByText(new RegExp(SEED_EVENT_TITLE))).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(SEED_REG_NAME));
    fireEvent.click(screen.getByRole("button", { name: /check in now/i }));

    await waitFor(() => {
      expect(screen.getByText("Checked in successfully!")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /issue strap/i })).toBeInTheDocument();
    });
  });

  it("issues a strap after check-in from the card", async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check in now/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /check in now/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /issue strap/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /issue strap/i }));

    await waitFor(() => {
      expect(screen.getByText("Strap issued")).toBeInTheDocument();
    });
  });

  it("updates delivered pre-order quantities from the check-in card", async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Delivered: 2/4")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Mark as delivered"));

    await waitFor(() => {
      expect(screen.getByText("Delivered: 3/4")).toBeInTheDocument();
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

  it("has no axe violations on the QR check-in flow with a loaded registration", async () => {
    const { container } = await renderPage();

    await waitFor(() => {
      expect(screen.getByText(SEED_REG_NAME)).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations on the manual search flow", async () => {
    const { container } = await renderPage("/check-in");

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations when showing an error", async () => {
    server.use(
      http.post("/api/check-in/:id/lookup", () => HttpResponse.json(null, { status: 404 })),
    );

    const { container } = await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Registration not found.")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

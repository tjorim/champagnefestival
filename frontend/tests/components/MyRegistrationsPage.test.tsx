import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import MyRegistrationsPage from "@/components/MyRegistrationsPage";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    my_registrations_title: () => "My Registrations",
    my_registrations_description: () => "Request a secure link by email.",
    my_registrations_email_label: () => "Email",
    my_registrations_email_placeholder: () => "email@example.com",
    my_registrations_request_link: () => "Email me a secure link",
    my_registrations_requesting: () => "Preparing secure link...",
    my_registrations_request_success: () =>
      "If we found registrations for that email, we prepared a secure link.",
    my_registrations_invalid_email: () => "Please enter a valid email address.",
    my_registrations_request_pending_notice: () => "Automatic email sending is not enabled yet.",
    my_registrations_loading: () => "Loading registrations...",
    my_registrations_invalid_token: () => "This secure link is invalid or expired.",
    my_registrations_no_results: () => "No registrations found.",
    my_registrations_error: () => "Unable to load your registrations.",
    my_registrations_guests_label: () => "guests",
    my_registrations_request_new_link: () => "Request another secure link",
    admin_status_confirmed: () => "Confirmed",
    admin_status_cancelled: () => "Cancelled",
    admin_status_pending: () => "Pending",
    admin_payment_paid: () => "Paid",
    admin_payment_partial: () => "Partial",
    admin_payment_unpaid: () => "Unpaid",
    admin_checked_in: () => "Checked in",
  },
}));

describe("MyRegistrationsPage", () => {
  async function renderPage(initialEntry = "/my-registrations") {
    const rootRoute = createRootRoute();
    const myRegistrationsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/my-registrations",
      validateSearch: (search: Record<string, unknown>) => ({
        token: typeof search.token === "string" ? search.token : undefined,
      }),
      component: MyRegistrationsPage,
    });
    const routeTree = rootRoute.addChildren([myRegistrationsRoute]);
    const memoryHistory = createMemoryHistory({ initialEntries: [initialEntry] });
    const router = createRouter({ routeTree, history: memoryHistory });
    await router.load();
    const Wrapper = createTestQueryClientWrapper();

    return render(<RouterProvider router={router} />, { wrapper: Wrapper });
  }

  it("requests a secure link instead of looking registrations up by email", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if we found registrations for that email/i)).toBeInTheDocument();
      expect(screen.getByText("Automatic email sending is not enabled yet.")).toBeInTheDocument();
    });
  });

  it("loads registrations when a secure token is present in the URL", async () => {
    // Any non-empty token is accepted by the MSW handler and returns the seed
    // registrations — reg-01 (Grand Opening), reg-02 (Tasting Day 1), reg-03
    // (Tasting Day 2).
    await renderPage("/my-registrations?token=any-valid-token");

    await waitFor(() => {
      expect(screen.getByText("Grand Opening")).toBeInTheDocument();
    });
  });

  it("shows an invalid-link message when the token is rejected", async () => {
    server.use(
      http.post("/api/registrations/my/access", () => HttpResponse.json(null, { status: 401 })),
    );

    await renderPage("/my-registrations?token=expired-token");

    await waitFor(() => {
      expect(screen.getByText("This secure link is invalid or expired.")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /request another secure link/i }),
      ).toBeInTheDocument();
    });
  });

  it("validates the email before sending the request", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });
  });

  it("shows an invalid email error when the API rejects the address", async () => {
    server.use(
      http.post("/api/registrations/my/request", () =>
        HttpResponse.json(null, { status: 422 }),
      ),
    );

    await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });
  });
});

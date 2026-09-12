import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyAccountPage from "@/components/MyAccountPage";
import { useAuth } from "@/contexts/AuthContext";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";

// MyRegistrationsPage needs a TanStack Router context (useSearch/useNavigate)
// that these tests don't set up — irrelevant here since none of them exercise
// the registrations tab itself.
vi.mock("@/components/MyRegistrationsPage", () => ({
  default: () => <div>Registrations section</div>,
}));

vi.mock("@/paraglide/messages", () => ({
  m: {
    my_account_title: () => "My Account",
    my_registrations_title: () => "Registrations",
    my_account_signed_in_as: ({ account }: { account: string }) => `Signed in as ${account}`,
    my_account_delete_heading: () => "Delete my account",
    my_account_delete_description: () => "Your festival records are kept.",
    my_account_delete_button: () => "Delete my account",
    my_account_deleting: () => "Deleting…",
    my_account_delete_confirm: () => "Delete your account?",
    my_account_delete_error: () => "Could not delete your account. Please try again.",
    pebble_pair_retry_sign_in: () => "Try signing in again",
    auth_signing_in: () => "Signing in…",
    auth_signing_out: () => "Signing out…",
    admin_action_cancel: () => "Cancel",
    admin_action_confirm: () => "Confirm",
    my_eid_title: () => "My eID",
    my_eid_load_error: () => "Could not load your volunteer identity. Please try again.",
    my_eid_register_heading: () => "Register your volunteer record",
    my_eid_register_description: () =>
      "Enter your name, National Register Number (NISS) and eID document number to create your own volunteer record.",
    my_eid_register_button: () => "Register my details",
    my_eid_register_error: () => "Could not register your details.",
    my_eid_invalid_niss: () => "That doesn't look like a valid National Register Number.",
    my_eid_invalid_eid: () => "That doesn't look like a valid eID document number.",
    my_eid_name_label: () => "Full name",
    my_eid_niss_label: () => "National Register Number (NISS)",
    my_eid_eid_label: () => "eID document number",
    my_eid_identity_heading: () => "Your identity on file",
    my_eid_correction_heading: () => "Report an eID renewal",
    my_eid_correction_description: () => "Let us know the new document number.",
    my_eid_new_number_label: () => "New eID document number",
    my_eid_note_label: () => "Note (optional)",
    my_eid_submit_correction: () => "Submit for review",
    my_eid_correction_submitted: () => "Thank you — an administrator will review your request.",
    my_eid_correction_error: () => "Could not submit your request.",
    my_eid_submitting: () => "Submitting…",
  },
}));

async function openDeleteConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Delete my account" }));
  return screen.getByRole("dialog");
}

describe("MyAccountPage", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-user",
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue("oidc-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });
  });

  it("deletes the account and signs out after confirmation", async () => {
    const logout = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-user",
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue("oidc-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout,
      renewSession: vi.fn().mockResolvedValue(false),
    });

    let capturedAuth: string | null = null;
    server.use(
      http.delete("/api/me", ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });

    expect(screen.getByText("Signed in as mock-user")).toBeInTheDocument();
    await openDeleteConfirm(user);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(capturedAuth).toBe("Bearer oidc-access-token");
  });

  it("does not delete when the confirmation is declined", async () => {
    let deleteCalled = false;
    server.use(
      http.delete("/api/me", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });
    await openDeleteConfirm(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteCalled).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error and re-enables the button when deletion fails", async () => {
    server.use(
      http.delete("/api/me", () =>
        HttpResponse.json({ detail: "Something went wrong" }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });
    await openDeleteConfirm(user);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).not.toBeDisabled();
  });

  it("shows a dismissible auth error without blocking the rest of the page", async () => {
    const clearAuthError = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: null,
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue(null),
      authError: "Keycloak is unreachable.",
      clearAuthError,
      login: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });

    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });

    expect(screen.getByText("Keycloak is unreachable.")).toBeInTheDocument();
    // The page never forces sign-in (unlike the old design), so the
    // registrations section still renders underneath the error.
    expect(screen.getByText("Registrations section")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close alert" }));

    expect(clearAuthError).toHaveBeenCalledTimes(1);
  });

  it("does not show the volunteer identity section for a non-volunteer account", async () => {
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });

    expect(await screen.findByRole("heading", { name: "Delete my account" })).toBeInTheDocument();
    expect(screen.queryByText("My eID")).not.toBeInTheDocument();
  });

  it("shows the volunteer registration form for an unlinked volunteer account", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-volunteer",
      roles: ["volunteer"],
      hasRole: vi.fn((role: string) => role === "volunteer"),
      getAccessToken: vi.fn().mockReturnValue("oidc-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });
    server.use(
      http.get("/api/me/volunteer", () =>
        HttpResponse.json({
          linked: false,
          name: null,
          national_register_number: null,
          eid_document_number: null,
        }),
      ),
    );

    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });

    expect(await screen.findByText("Register your volunteer record")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delete my account" })).toBeInTheDocument();
  });

  it("shows three switchable tabs for an authenticated volunteer, defaulting to Registrations", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-volunteer",
      roles: ["volunteer"],
      hasRole: vi.fn((role: string) => role === "volunteer"),
      getAccessToken: vi.fn().mockReturnValue("oidc-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });
    server.use(
      http.get("/api/me/volunteer", () =>
        HttpResponse.json({
          linked: false,
          name: null,
          national_register_number: null,
          eid_document_number: null,
        }),
      ),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });

    const registrationsTab = await screen.findByRole("tab", { name: "Registrations" });
    const volunteerTab = screen.getByRole("tab", { name: "My eID" });
    const accountTab = screen.getByRole("tab", { name: "My Account" });
    expect(registrationsTab).toHaveAttribute("aria-selected", "true");
    expect(volunteerTab).toHaveAttribute("aria-selected", "false");

    await user.click(accountTab);
    expect(accountTab).toHaveAttribute("aria-selected", "true");
    expect(registrationsTab).toHaveAttribute("aria-selected", "false");
  });
});

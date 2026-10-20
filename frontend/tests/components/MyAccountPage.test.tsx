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
    close: () => "Close",
    logo_upload_label: () => "Upload logo",
    logo_upload_help: () => "PNG, JPEG or WebP",
    manager_change_help: () => "Submit for review",
    manager_title: () => "My organisations",
    manager_error: () => "Could not load organizations",
    manager_change_edit: () => "Edit website and description",
    my_account_title: () => "My Account",
    my_registrations_title: () => "Registrations",
    my_registrations_sign_out: () => "Sign out",
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
    my_eid_correction_heading: () => "Update your eID document number",
    my_eid_correction_description: () => "Update the document number here.",
    my_eid_new_number_label: () => "New eID document number",
    my_eid_submit_correction: () => "Save",
    my_eid_correction_success: () => "Your eID document number has been updated.",
    my_eid_correction_error: () => "Could not update your eID document number.",
    my_eid_submitting: () => "Submitting…",
    my_poll_heading: () => "Your answers",
    my_poll_description: () => "Answer the questions below.",
    my_poll_meals_hint: () => "Choose how many of each you'd like.",
    my_poll_people_label: () => "Number of people (including you)",
    my_poll_people_decrease: ({ title }: { title: string }) => `Fewer people for ${title}`,
    my_poll_people_increase: ({ title }: { title: string }) => `More people for ${title}`,
    poll_answer_yes: () => "Yes",
    poll_answer_no: () => "No",
    my_poll_quantity_decrease: ({ label }: { label: string }) => `Fewer ${label}`,
    my_poll_quantity_increase: ({ label }: { label: string }) => `More ${label}`,
    my_poll_load_error: () => "Could not load the meal choices. Please try again.",
    my_poll_save_error: () => "Could not save your choice. Please try again.",
    my_poll_closed: () => "This question has closed.",
    my_poll_closes_at: ({ time }: { time: string }) => `Change your choices until ${time}.`,
    my_poll_note_label: () => "Allergies or dietary requirements",
    my_poll_note_save: () => "Save note",
    poll_dietary_vegan: () => "Vegan",
    api_error_poll_question_closed: () =>
      "This question has closed, so this can no longer be changed.",
  },
}));

async function openDeleteConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "My Account" }));
  await user.click(screen.getByRole("button", { name: "Delete my account" }));
  return screen.getByRole("alertdialog");
}

describe("MyAccountPage", () => {
  beforeEach(() => {
    server.use(http.get("/api/me/organizations", () => HttpResponse.json([])));
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

  it("shows organizations for the same OIDC account as staff sections", async () => {
    let authorization: string | null = null;
    server.use(
      http.get("/api/me/organizations", ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json([
          { id: 1, name: "Shared account house", type: "producer", website: "", active: true },
        ]);
      }),
    );
    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });
    await user.click(await screen.findByRole("tab", { name: "My organisations" }));
    expect(screen.getByText("Shared account house")).toBeVisible();
    expect(authorization).toBe("Bearer oidc-access-token");
    expect(screen.getByRole("tab", { name: "My Account" })).toBeVisible();
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
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
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

    // The 500 body is English diagnostics; the translated message is shown.
    expect(
      await screen.findByText("Could not delete your account. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(clearAuthError).toHaveBeenCalledTimes(1);
  });

  it("does not show the volunteer identity section for a non-volunteer account", async () => {
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });

    await userEvent.setup().click(screen.getByRole("tab", { name: "My Account" }));
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

    await userEvent.setup().click(screen.getByRole("tab", { name: "My eID" }));
    expect(await screen.findByText("Register your volunteer record")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "My Account" }));
    expect(screen.getByRole("heading", { name: "Delete my account" })).toBeInTheDocument();
  });

  it("updates the eID document number directly for a linked volunteer", async () => {
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
          linked: true,
          name: "Sofie De Smet",
          national_register_number: "91010112319",
          eid_document_number: "123456789002",
        }),
      ),
      http.post("/api/me/volunteer/eid-correction", async ({ request }) => {
        const body = (await request.json()) as { eid_document_number: string };
        return HttpResponse.json({
          linked: true,
          name: "Sofie De Smet",
          national_register_number: "91010112319",
          eid_document_number: body.eid_document_number,
        });
      }),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });

    await user.click(screen.getByRole("tab", { name: "My eID" }));
    expect(await screen.findByText("Update your eID document number")).toBeInTheDocument();
    const input = screen.getByLabelText("New eID document number");
    await user.type(input, "123456789103");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Your eID document number has been updated."),
    ).toBeInTheDocument();
    // No more admin-review copy — this is now a direct write.
    expect(screen.queryByText(/administrator will review/i)).not.toBeInTheDocument();
  });

  it("rejects an invalid eID checksum on correction without calling the API", async () => {
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
    let correctionCalls = 0;
    server.use(
      http.get("/api/me/volunteer", () =>
        HttpResponse.json({
          linked: true,
          name: "Sofie De Smet",
          national_register_number: "91010112319",
          eid_document_number: "123456789002",
        }),
      ),
      http.post("/api/me/volunteer/eid-correction", () => {
        correctionCalls += 1;
        return HttpResponse.json({ detail: "invalid" }, { status: 422 });
      }),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });

    await user.click(screen.getByRole("tab", { name: "My eID" }));
    const input = await screen.findByLabelText("New eID document number");
    await user.type(input, "999999999999");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("That doesn't look like a valid eID document number."),
    ).toBeInTheDocument();
    expect(correctionCalls).toBe(0);
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

  describe("volunteer poll", () => {
    function mockVolunteer() {
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
            linked: true,
            name: "Sofie De Smet",
            national_register_number: "91010112319",
            eid_document_number: "123456789002",
          }),
        ),
      );
    }

    const dinner = (extra: Record<string, unknown> = {}) => ({
      id: "q-dinner",
      kind: "yes_no",
      title: "Dinner on Sunday?",
      description: "",
      closes_at: null,
      closed: false,
      options: [],
      selections: [],
      attending: null,
      people: 0,
      ...extra,
    });
    const meals = (extra: Record<string, unknown> = {}) => ({
      id: "q-meals",
      kind: "meals",
      title: "Meals",
      description: "",
      closes_at: null,
      closed: false,
      options: [
        { id: "poll-dish-1", label: "Vol-au-vent", dietary_tags: [] },
        { id: "poll-soup-1", label: "Tomatensoep", dietary_tags: ["vegan"] },
      ],
      selections: [],
      attending: null,
      people: 0,
      ...extra,
    });
    const poll = (questions: Record<string, unknown>[], note: string | null = null) => ({
      edition_id: "2026-october",
      questions,
      note,
    });

    async function openPoll() {
      const user = userEvent.setup();
      render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });
      await user.click(screen.getByRole("tab", { name: "My eID" }));
      return user;
    }

    it("lets a volunteer pick meal quantities, saving the whole set each time", async () => {
      mockVolunteer();
      const saved: unknown[] = [];
      const requestedLocales: (string | null)[] = [];
      let current = meals();
      server.use(
        http.get("/api/me/volunteer/poll", ({ request }) => {
          requestedLocales.push(new URL(request.url).searchParams.get("locale"));
          return HttpResponse.json(poll([current]));
        }),
        http.put("/api/me/volunteer/poll/questions/q-meals", async ({ request }) => {
          requestedLocales.push(new URL(request.url).searchParams.get("locale"));
          const body = (await request.json()) as { selections: unknown[] };
          saved.push(body);
          current = meals({ selections: body.selections });
          return HttpResponse.json(poll([current]));
        }),
      );

      const user = await openPoll();
      const moreSoup = await screen.findByRole("button", { name: "More Tomatensoep" });
      expect(screen.getByRole("button", { name: "Fewer Tomatensoep" })).toBeDisabled();
      expect(screen.getByText("Vegan")).toBeInTheDocument();
      // The questions are asked for in the interface language.
      expect(requestedLocales[0]).toMatch(/^(nl|fr|en)$/);

      await user.click(moreSoup);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Fewer Tomatensoep" })).toBeEnabled(),
      );
      await user.click(screen.getByRole("button", { name: "More Tomatensoep" }));
      await waitFor(() => expect(saved).toHaveLength(2));
      await user.click(await screen.findByRole("button", { name: "More Vol-au-vent" }));
      await waitFor(() => expect(saved).toHaveLength(3));

      expect(saved[0]).toEqual({ selections: [{ option_id: "poll-soup-1", quantity: 1 }] });
      expect(saved[1]).toEqual({ selections: [{ option_id: "poll-soup-1", quantity: 2 }] });
      expect(saved[2]).toEqual({
        selections: [
          { option_id: "poll-soup-1", quantity: 2 },
          { option_id: "poll-dish-1", quantity: 1 },
        ],
      });

      // Going back down to none drops the option from the saved set.
      await user.click(screen.getByRole("button", { name: "Fewer Vol-au-vent" }));
      await waitFor(() => expect(saved).toHaveLength(4));
      expect(saved[3]).toEqual({ selections: [{ option_id: "poll-soup-1", quantity: 2 }] });
    });

    it("answers a yes/no question with a number of people", async () => {
      mockVolunteer();
      const saved: Record<string, unknown>[] = [];
      let current = dinner();
      server.use(
        http.get("/api/me/volunteer/poll", () => HttpResponse.json(poll([current]))),
        http.put("/api/me/volunteer/poll/questions/q-dinner", async ({ request }) => {
          const body = (await request.json()) as { attending: boolean; people?: number };
          saved.push(body);
          current = dinner({ attending: body.attending, people: body.people ?? 0 });
          return HttpResponse.json(poll([current]));
        }),
      );

      const user = await openPoll();
      const yes = await screen.findByRole("button", { name: "Yes" });
      const no = screen.getByRole("button", { name: "No" });
      expect(yes).toHaveAttribute("aria-pressed", "false");
      expect(no).toHaveAttribute("aria-pressed", "false");
      // The people stepper only shows once the answer is yes.
      expect(screen.queryByText("Number of people (including you)")).not.toBeInTheDocument();

      await user.click(yes);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "true"),
      );
      expect(saved[0]).toEqual({ attending: true, people: 1 });
      expect(screen.getByText("Number of people (including you)")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Fewer people for Dinner on Sunday?" }),
      ).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "More people for Dinner on Sunday?" }));
      await waitFor(() => expect(saved).toHaveLength(2));
      expect(saved[1]).toEqual({ attending: true, people: 2 });

      // A no sends no head count and hides the stepper again.
      await user.click(screen.getByRole("button", { name: "No" }));
      await waitFor(() => expect(saved).toHaveLength(3));
      expect(saved[2]).toEqual({ attending: false });
      await waitFor(() =>
        expect(screen.queryByText("Number of people (including you)")).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
    });

    it("saves the dietary note on its own", async () => {
      mockVolunteer();
      const saved: Record<string, unknown>[] = [];
      server.use(
        http.get("/api/me/volunteer/poll", () =>
          HttpResponse.json(
            poll(
              [meals({ selections: [{ option_id: "poll-soup-1", quantity: 1 }] })],
              "Geen noten",
            ),
          ),
        ),
        http.put("/api/me/volunteer/poll/note", async ({ request }) => {
          const body = (await request.json()) as { note: string };
          saved.push(body);
          return HttpResponse.json(poll([meals()], body.note || null));
        }),
      );

      const user = await openPoll();
      const note = await screen.findByLabelText("Allergies or dietary requirements");
      expect(note).toHaveValue("Geen noten");
      const save = screen.getByRole("button", { name: "Save note" });
      expect(save).toBeDisabled();

      await user.clear(note);
      await user.type(note, "Glutenvrij");
      await user.click(save);

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(saved[0]).toEqual({ note: "Glutenvrij" });
    });

    it("shows a closed question as read-only while the other stays open", async () => {
      mockVolunteer();
      server.use(
        http.get("/api/me/volunteer/poll", () =>
          HttpResponse.json(
            poll([
              dinner({
                closed: true,
                closes_at: "2026-10-01T10:00:00Z",
                attending: true,
                people: 2,
              }),
              meals(),
            ]),
          ),
        ),
      );

      await openPoll();
      expect(await screen.findByText("This question has closed.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "More people for Dinner on Sunday?" }),
      ).toBeDisabled();
      // The meals question has no deadline, so its steppers stay usable.
      expect(screen.getByRole("button", { name: "More Tomatensoep" })).toBeEnabled();
      expect(screen.getByLabelText("Allergies or dietary requirements")).toBeEnabled();
    });

    it("locks the note once every meals question has closed", async () => {
      mockVolunteer();
      server.use(
        http.get("/api/me/volunteer/poll", () =>
          HttpResponse.json(poll([meals({ closed: true, closes_at: "2026-10-01T10:00:00Z" })])),
        ),
      );

      await openPoll();
      expect(await screen.findByLabelText("Allergies or dietary requirements")).toBeDisabled();
      expect(screen.getByRole("button", { name: "More Tomatensoep" })).toBeDisabled();
    });

    it("shows nothing when the edition has no questions", async () => {
      mockVolunteer();
      server.use(http.get("/api/me/volunteer/poll", () => HttpResponse.json(poll([]))));

      await openPoll();
      await screen.findByText("Your identity on file");
      expect(screen.queryByText("Your answers")).not.toBeInTheDocument();
    });

    it("explains a rejected save from its error code", async () => {
      mockVolunteer();
      server.use(
        http.get("/api/me/volunteer/poll", () => HttpResponse.json(poll([meals()]))),
        http.put("/api/me/volunteer/poll/questions/q-meals", () =>
          HttpResponse.json(
            { detail: "This question has closed.", code: "poll_question_closed" },
            { status: 409 },
          ),
        ),
      );

      const user = await openPoll();
      await user.click(await screen.findByRole("button", { name: "More Tomatensoep" }));
      expect(
        await screen.findByText("This question has closed, so this can no longer be changed."),
      ).toBeInTheDocument();
    });
  });

  it("signs out an OIDC account through one button that also ends the emailed session", async () => {
    const logout = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-staff",
      roles: ["admin"],
      hasRole: vi.fn((role: string) => role === "admin"),
      getAccessToken: vi.fn().mockReturnValue("oidc-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout,
      renewSession: vi.fn().mockResolvedValue(false),
    });

    const user = userEvent.setup();
    render(<MyAccountPage />, { wrapper: createTestQueryClientWrapper() });
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EmailPreferences from "@/components/EmailPreferences";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const categories = [
  {
    key: "club_news",
    name: "Club news",
    description: "News for members.",
    automatic: false,
    consented: false,
    granted_at: null,
  },
  {
    key: "reward_ready",
    name: "Reward ready",
    description: "A reward is ready.",
    automatic: true,
    consented: true,
    granted_at: "2026-10-01T10:00:00Z",
  },
];

function mount(token: string | null = "mock-access-token") {
  render(<EmailPreferences getAccessToken={() => token} />, {
    wrapper: createTestQueryClientWrapper(),
  });
}

beforeEach(() => setLocale("en", { reload: false }));
afterEach(cleanup);

describe("EmailPreferences", () => {
  it("lists the categories with their current state and the address they are for", async () => {
    server.use(
      http.get("/api/me/email-preferences", ({ request }) => {
        expect(new URL(request.url).searchParams.get("locale")).toBe("en");
        expect(request.headers.get("authorization")).toBe("Bearer mock-access-token");
        return HttpResponse.json({ email: "ann@example.com", categories });
      }),
    );
    mount();

    expect(await screen.findByRole("checkbox", { name: "Club news" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Reward ready" })).toBeChecked();
    expect(screen.getByText(/ann@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/A reward is ready\. Sent automatically/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
  });

  it("sends only the changed categories and confirms the saved state", async () => {
    let sent: unknown;
    server.use(
      http.get("/api/me/email-preferences", () =>
        HttpResponse.json({ email: "ann@example.com", categories }),
      ),
      http.put("/api/me/email-preferences", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          email: "ann@example.com",
          categories: [{ ...categories[0], consented: true }, categories[1]],
        });
      }),
    );
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("checkbox", { name: "Club news" }));
    await user.click(screen.getByRole("button", { name: "Save preferences" }));

    await waitFor(() => expect(sent).toEqual({ consents: { club_news: true } }));
    expect(await screen.findByText("Your email preferences are saved.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Club news" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
  });

  it("works with an emailed-link session, which has no bearer token", async () => {
    let authorization: string | null = "unset";
    server.use(
      http.get("/api/me/email-preferences", ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json({ email: "ann@example.com", categories });
      }),
    );
    mount(null);

    await screen.findByRole("checkbox", { name: "Club news" });
    expect(authorization).toBeNull();
  });

  it("explains an unavailable category from its error code", async () => {
    server.use(
      http.get("/api/me/email-preferences", () =>
        HttpResponse.json({ email: "ann@example.com", categories }),
      ),
      http.put("/api/me/email-preferences", () =>
        HttpResponse.json(
          { detail: "not available", code: "email_category_unavailable" },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("checkbox", { name: "Club news" }));
    await user.click(screen.getByRole("button", { name: "Save preferences" }));

    expect(
      await screen.findByText("This email category is not available for your account."),
    ).toBeInTheDocument();
    expect(screen.queryByText("not available")).not.toBeInTheDocument();
  });

  it("explains when there is nothing to choose yet or no verified address", async () => {
    server.use(
      http.get("/api/me/email-preferences", () =>
        HttpResponse.json({ email: "ann@example.com", categories: [] }),
      ),
    );
    mount();
    expect(
      await screen.findByText(/No email categories are available for ann@example.com/),
    ).toBeInTheDocument();
    cleanup();

    server.use(
      http.get("/api/me/email-preferences", () =>
        HttpResponse.json({ email: null, categories: [] }),
      ),
    );
    mount();
    expect(await screen.findByText(/Sign in with a verified email address/)).toBeInTheDocument();
  });

  it("shows a translated error when the preferences cannot be loaded", async () => {
    server.use(http.get("/api/me/email-preferences", () => HttpResponse.json({}, { status: 500 })));
    mount();
    expect(
      await screen.findByText("Your email preferences could not be loaded."),
    ).toBeInTheDocument();
  });
});

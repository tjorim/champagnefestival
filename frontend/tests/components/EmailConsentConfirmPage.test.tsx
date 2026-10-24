import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw/http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EmailConsentConfirmPage from "@/components/EmailConsentConfirmPage";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { validateMyRegistrationsSearch } from "@/router";
import { createTestQueryClientWrapper } from "../utils/queryClient";

async function renderPage(entry: string) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "/email-consent",
    validateSearch: validateMyRegistrationsSearch,
    component: EmailConsentConfirmPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  await router.load();
  const Wrapper = createTestQueryClientWrapper();
  render(<RouterProvider router={router} />, { wrapper: Wrapper });
  return router;
}

beforeEach(() => setLocale("en", { reload: false }));
afterEach(cleanup);

describe("EmailConsentConfirmPage", () => {
  it("activates the consent only after a click, then removes the token from the address bar", async () => {
    let sent: unknown;
    server.use(
      http.post("/api/email-consents/confirm", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          category_key: "new_editions",
          category_name: "New festival editions",
        });
      }),
    );
    const user = userEvent.setup();
    const router = await renderPage("/email-consent?token=secret-token");

    expect(sent).toBeUndefined();
    await waitFor(() => expect(router.state.location.search).toEqual({}));

    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText(/You will now receive emails about: New festival editions/),
    ).toBeInTheDocument();
    expect(sent).toEqual({ token: "secret-token", locale: "en" });
  });

  it("explains a used or expired link without offering another attempt", async () => {
    server.use(
      http.post("/api/email-consents/confirm", () =>
        HttpResponse.json(
          { detail: "Invalid or expired confirmation link.", code: "consent_confirmation_invalid" },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    await renderPage("/email-consent?token=old-token");

    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("says so when the link carries no token", async () => {
    await renderPage("/email-consent");
    expect(await screen.findByText(/link is incomplete/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });
});

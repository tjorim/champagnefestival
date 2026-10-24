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
import EmailUnsubscribePage from "@/components/EmailUnsubscribePage";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { validateMyRegistrationsSearch } from "@/router";
import { createTestQueryClientWrapper } from "../utils/queryClient";

async function renderPage(entry: string) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "/email-unsubscribe",
    validateSearch: validateMyRegistrationsSearch,
    component: EmailUnsubscribePage,
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

describe("EmailUnsubscribePage", () => {
  it("names the category, unsubscribes only after a click and removes the token from the address bar", async () => {
    let unsubscribedWith: string | null = null;
    server.use(
      http.get("/api/mail/unsubscribe/category", () =>
        HttpResponse.json({ category_key: "club_news", category_name: "Club news" }),
      ),
      http.post("/api/mail/unsubscribe", ({ request }) => {
        unsubscribedWith = new URL(request.url).searchParams.get("token");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const router = await renderPage("/email-unsubscribe?token=signed.token");

    expect(await screen.findByText(/stop receiving emails about: Club news/)).toBeInTheDocument();
    expect(unsubscribedWith).toBeNull();
    await waitFor(() => expect(router.state.location.search).toEqual({}));

    await user.click(screen.getByRole("button", { name: "Unsubscribe" }));

    expect(
      await screen.findByText(/no longer receive emails about: Club news/),
    ).toBeInTheDocument();
    expect(unsubscribedWith).toBe("signed.token");
  });

  it("explains an invalid link without offering to unsubscribe", async () => {
    server.use(
      http.get("/api/mail/unsubscribe/category", () =>
        HttpResponse.json(
          { detail: "This unsubscribe link is not valid.", code: "unsubscribe_token_invalid" },
          { status: 404 },
        ),
      ),
    );
    await renderPage("/email-unsubscribe?token=forged");

    expect(await screen.findByText("This unsubscribe link is not valid.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unsubscribe" })).not.toBeInTheDocument();
  });

  it("says so when the link carries no token", async () => {
    await renderPage("/email-unsubscribe");
    expect(await screen.findByText(/link is incomplete/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unsubscribe" })).not.toBeInTheDocument();
  });
});

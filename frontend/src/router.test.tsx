import { QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppRouter } from "./router";

// A plain flag rather than vi.fn(): mocks are cleared between tests, which
// would hide a load that happened when this file imported the router.
const liveUpdates = vi.hoisted(() => ({ loaded: false }));

vi.mock("./state/LiveUpdatesProvider", () => {
  liveUpdates.loaded = true;
  return { LiveUpdatesProvider: () => <div data-testid="live-updates" /> };
});

function page(name: string) {
  return () => <h1>{name}</h1>;
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  const router = createAppRouter({
    App: page("Home"),
    AdminPage: page("Admin"),
    CheckInRoute: page("Check-in"),
    PrivacyPolicyRoute: page("Privacy"),
    PebblePairRoute: page("Pebble"),
    MyAccountRoute: page("Account"),
    EmailConsentRoute: page("Email consent"),
    EmailUnsubscribeRoute: page("Email unsubscribe"),
    VenuePlanRoute: page("Venue plan"),
    queryClient: new QueryClient(),
  });
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("admin live updates", () => {
  it("are neither loaded nor mounted on the public home page", async () => {
    renderAt("/");

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByTestId("live-updates")).not.toBeInTheDocument();
    expect(liveUpdates.loaded).toBe(false);
  });

  it("are mounted by the admin layout", async () => {
    renderAt("/admin");

    expect(await screen.findByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(await screen.findByTestId("live-updates")).toBeInTheDocument();
  });
});

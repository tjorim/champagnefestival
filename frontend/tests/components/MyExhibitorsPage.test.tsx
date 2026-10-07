import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyExhibitorsPage from "@/components/MyExhibitorsPage";

const state = vi.hoisted(() => ({ token: undefined as string | undefined, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({ token: state.token }),
  useNavigate: () => state.navigate,
}));

beforeEach(() => {
  state.token = undefined;
  state.navigate.mockReset();
  vi.restoreAllMocks();
});

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }));
}

describe("exhibitor manager self-service", () => {
  it("requests a link without staff authentication and shows the accepted message", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => respond({ authenticated: false }));
    render(<MyExhibitorsPage />);
    const button = screen.getByRole("button", { name: "Email me a sign-in link" });
    await waitFor(() => expect(button).toBeEnabled());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Contact email address"), "contact@example.com");
    await user.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent("If this email belongs");
    expect(fetch).toHaveBeenLastCalledWith("/api/exhibitor-manager-sessions/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "contact@example.com" }),
    });
  });

  it("removes the token before redeeming once, lists exhibitors and signs out", async () => {
    state.token = "secret";
    const calls: string[] = [];
    state.navigate.mockImplementation(() => {
      calls.push("replace");
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((path) => {
      calls.push(String(path));
      if (path === "/api/me/exhibitors") return respond([{ id: 1, name: "My business" }]);
      if (path === "/api/exhibitor-manager-sessions/sign-out") return respond(null, 204);
      return respond({ authenticated: true });
    });
    render(<MyExhibitorsPage />);
    expect(await screen.findByText("My business")).toBeVisible();
    expect(calls.slice(0, 2)).toEqual(["replace", "/api/exhibitor-manager-sessions/redeem"]);
    expect(state.navigate).toHaveBeenCalledWith({ search: {}, replace: true });
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByLabelText("Contact email address")).toBeVisible();
    expect(screen.queryByText("My business")).not.toBeInTheDocument();
  });

  it("shows an expired-link error and lets the contact request another link", async () => {
    state.token = "expired";
    vi.spyOn(globalThis, "fetch").mockImplementation(() => respond({}, 401));
    render(<MyExhibitorsPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("Unable to complete");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled(),
    );
  });
});

import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import MyMembership from "@/components/MyMembership";
import { server } from "@/mocks/server";
import { m } from "@/paraglide/messages";
import { createTestQueryClientWrapper } from "../utils/queryClient";

for (const state of ["active", "inactive", "unavailable"] as const) {
  it(`explains ${state} membership without staff links`, async () => {
    server.use(http.get("/api/me/membership", () => HttpResponse.json({ state })));
    render(<MyMembership accountId="self" getAccessToken={() => "token"} />, {
      wrapper: createTestQueryClientWrapper(),
    });
    const expected = {
      active: m.membership_active(),
      inactive: m.membership_inactive(),
      unavailable: m.membership_unknown(),
    }[state];
    expect(await screen.findByText(expected)).toBeVisible();
    expect(screen.getByText(m.membership_help())).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
}

describe("unavailable server", () => {
  it("shows a retryable load error rather than an inactive membership", async () => {
    server.use(
      http.get("/api/me/membership", () =>
        HttpResponse.json({ detail: "PRIVATE DIAGNOSTIC" }, { status: 503 }),
      ),
    );
    render(<MyMembership accountId="self" getAccessToken={() => "token"} />, {
      wrapper: createTestQueryClientWrapper(),
    });
    expect(await screen.findByText(m.membership_load_error())).toBeVisible();
    expect(screen.queryByText(m.membership_inactive())).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE DIAGNOSTIC")).not.toBeInTheDocument();
  });
});

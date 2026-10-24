import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw/http";
import PersonEmailConsents from "@/components/admin/PersonEmailConsents";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

const active = {
  id: "ecn_1",
  category_key: "club_news",
  category_name: "Clubnieuws",
  source: "self_service",
  granted_at: "2026-10-01T10:00:00Z",
  revoked_at: null,
  revoked_source: null,
};
const withdrawn = {
  id: "ecn_0",
  category_key: "new_editions",
  category_name: "Nieuwe editie",
  source: "registration_form",
  granted_at: "2026-09-01T10:00:00Z",
  revoked_at: "2026-09-15T10:00:00Z",
  revoked_source: "admin",
};

function mount() {
  render(
    <PersonEmailConsents
      person={{ id: "per_1", name: "Ann" }}
      authHeaders={authHeaders}
      onClose={vi.fn()}
    />,
    { wrapper: createTestQueryClientWrapper() },
  );
}

beforeEach(() => setLocale("en", { reload: false }));
afterEach(cleanup);

describe("PersonEmailConsents", () => {
  it("shows the history and offers an opt-out only for active consent, never a grant", async () => {
    server.use(
      http.get("/api/people/per_1/email-consents", () => HttpResponse.json([active, withdrawn])),
    );
    mount();

    expect(await screen.findByText("Clubnieuws")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    expect(screen.getByText(/opt-out recorded by an administrator/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Record opt-out" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /grant|give consent/i })).not.toBeInTheDocument();
  });

  it("records an opt-out after confirmation and shows the updated history", async () => {
    let called = false;
    server.use(
      http.get("/api/people/per_1/email-consents", () => HttpResponse.json([active])),
      http.post("/api/people/per_1/email-consents/club_news/opt-out", () => {
        called = true;
        return HttpResponse.json([
          { ...active, revoked_at: "2026-10-24T10:00:00Z", revoked_source: "admin" },
        ]);
      }),
    );
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Record opt-out" }));
    const buttons = await screen.findAllByRole("button", { name: "Record opt-out" });
    const confirm = buttons.at(-1);
    if (!confirm) throw new Error("The confirmation button is missing");
    fireEvent.click(confirm);

    await waitFor(() => expect(called).toBe(true));
    expect(await screen.findByText("Withdrawn")).toBeInTheDocument();
  });

  it("says when the person never gave consent", async () => {
    server.use(http.get("/api/people/per_1/email-consents", () => HttpResponse.json([])));
    mount();
    expect(await screen.findByText("This person has never given consent.")).toBeInTheDocument();
  });
});

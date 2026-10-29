import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw/http";
import EmailCategoryManagement from "@/components/admin/EmailCategoryManagement";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

function category(key: string, nl: string, roles: string[], automatic = false) {
  return {
    key,
    name: nl,
    description: null,
    name_nl: nl,
    name_fr: null,
    name_en: null,
    description_nl: null,
    description_fr: null,
    description_en: null,
    allowed_roles: roles,
    automatic,
    sort_order: 10,
  };
}

function mount() {
  render(<EmailCategoryManagement authHeaders={authHeaders} />, {
    wrapper: createTestQueryClientWrapper(),
  });
}

beforeEach(() => {
  setLocale("en", { reload: false });
  server.use(
    http.get("/api/email-categories", () =>
      HttpResponse.json([
        category("club_news", "Clubnieuws", ["member"]),
        category("new_editions", "Nieuwe editie", []),
        category("reward_ready", "Beloning klaar", ["member"], true),
      ]),
    ),
  );
});
afterEach(cleanup);

describe("EmailCategoryManagement", () => {
  it("lists categories with the roles that may use them", async () => {
    mount();

    const club = (await screen.findByText("club_news")).closest("tr")!;
    expect(within(club).getByText("Member")).toBeInTheDocument();
    const everyone = screen.getByText("new_editions").closest("tr")!;
    expect(within(everyone).getByText("Everyone")).toBeInTheDocument();
    const reward = screen.getByText("reward_ready").closest("tr")!;
    expect(within(reward).getByText("Automatic")).toBeInTheDocument();
  });

  it("creates a category with translated texts and roles, never an automatic one", async () => {
    let sent: unknown;
    server.use(
      http.post("/api/email-categories", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(category("tastings", "Proeverijen", ["volunteer"]), {
          status: 201,
        });
      }),
    );
    mount();
    await screen.findByText("club_news");

    fireEvent.click(screen.getByRole("button", { name: "Add email category" }));
    fireEvent.change(await screen.findByLabelText("Key"), { target: { value: "tastings" } });
    fireEvent.change(screen.getByLabelText("Name (nl)"), { target: { value: "Proeverijen" } });
    fireEvent.change(screen.getByLabelText("Description (nl)"), {
      target: { value: "Uitnodigingen" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Volunteer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toEqual({
      key: "tastings",
      name_nl: "Proeverijen",
      name_fr: null,
      name_en: null,
      description_nl: "Uitnodigingen",
      description_fr: null,
      description_en: null,
      allowed_roles: ["volunteer"],
      sort_order: 20,
    });
  });

  it("rejects an invalid key and a missing Dutch name before calling the API", async () => {
    mount();
    await screen.findByText("club_news");

    fireEvent.click(screen.getByRole("button", { name: "Add email category" }));
    fireEvent.change(await screen.findByLabelText("Key"), { target: { value: "Bad Key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/must start with a lowercase letter/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "good-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a name in Dutch.")).toBeInTheDocument();
  });

  it("edits texts and roles but never the key", async () => {
    let sent: { key: string; body: unknown } | undefined;
    server.use(
      http.put("/api/email-categories/:key", async ({ request, params }) => {
        sent = { key: String(params.key), body: await request.json() };
        return HttpResponse.json(category("club_news", "Clubnieuws", []));
      }),
    );
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Edit club_news" }));
    expect(await screen.findByLabelText("Key")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("checkbox", { name: "Member" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent?.key).toBe("club_news");
    expect(sent?.body).toMatchObject({ name_nl: "Clubnieuws", allowed_roles: [] });
    expect(sent?.body).not.toHaveProperty("key");
    expect(sent?.body).not.toHaveProperty("automatic");
  });

  it("explains why a protected category cannot be deleted from its error code", async () => {
    server.use(
      http.delete("/api/email-categories/new_editions", () =>
        HttpResponse.json(
          { detail: "Cannot delete", code: "email_category_protected" },
          { status: 409 },
        ),
      ),
    );
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Delete new_editions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/The application uses this email category/)).toBeInTheDocument();
  });
});

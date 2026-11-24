import { jsonResponse } from "@/mocks/response";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw/http";
import { OrganizationsHarness } from "../../../utils/OrganizationsHarness";
import {
  resetAdminOrganizationsCollection,
  type AdminOrganizationsCollection,
} from "@/lib/collections/adminOrganizationsCollection";
import { seedOrganizations } from "@/mocks/data/organizations";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../../../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

// GET /api/organizations requires a Bearer token recognized by the mock server
// (see `validAdminTokens` in src/mocks/handlers/admin/auth.ts) — an empty headers
// object would 401 and never surface the seeded organizations.

function renderOrganizations() {
  const queryClient = createTestQueryClient();
  let collection!: AdminOrganizationsCollection;

  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <OrganizationsHarness
        onCollection={(created) => {
          collection = created;
        }}
      />
    </QueryClientProvider>,
  );

  return { container, collection: () => collection };
}

describe("OrganizationsManagement", () => {
  it("renders seeded organizations after loading and hides the loading spinner", async () => {
    renderOrganizations();

    expect(screen.getAllByText("admin_content_loading").length).toBeGreaterThan(0);

    expect(await screen.findByText("Maison Moët & Chandon")).toBeInTheDocument();
    expect(screen.getByText("Champagne Bollinger")).toBeInTheDocument();

    expect(screen.queryByText("admin_content_loading")).not.toBeInTheDocument();
  });

  it("has no axe violations once loaded", async () => {
    const { container } = renderOrganizations();

    expect(await screen.findByText("Maison Moët & Chandon")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // The archive action is a self-contained PUT against a known, seeded id; it
  // moves the row through the organisations collection, the list's only cache.
  it("archives an organization: fires a PUT request and moves the item into the archived section", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.put("/api/organizations/:id", async ({ request, params }) => {
        capturedBody = await request.json();
        return jsonResponse<import("@/api-types").OrganizationOut>({
          description_nl: null,
          description_fr: null,
          description_en: null,
          id: Number(params.id),
          name: "Maison Moët & Chandon",
          image: "/images/moet.png",
          website: "https://www.moet.com",
          active: false,
          type: "producer",
          contact_person_id: "person-01",
          contact_person: {
            preferred_language: null,
            id: "person-01",
            name: "Alice Dupont",
            email: "alice@moet.com",
            phone: "+32471000001",
          },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        });
      }),
    );

    renderOrganizations();

    await screen.findByText("Maison Moët & Chandon");

    const archiveButton = screen.getByRole("button", {
      name: "admin_content_archive: Maison Moët & Chandon",
    });
    fireEvent.click(archiveButton);

    await waitFor(() => {
      expect(capturedBody).toEqual({ active: false });
    });

    const archivedToggle = await screen.findByRole("button", {
      name: "admin_content_archived_section",
    });
    fireEvent.click(archivedToggle);

    const archivedRow = await screen.findByText("Maison Moët & Chandon");
    const row = archivedRow.closest('[data-slot="presentation-list-item"]');
    expect(row).not.toBeNull();
    expect(row).toHaveClass("opacity-50");
  });

  it("asks before deleting an archived organization, naming it, and only then sends the DELETE", async () => {
    const deleted: string[] = [];
    server.use(
      http.put("/api/organizations/:id", ({ params }) =>
        jsonResponse<import("@/api-types").OrganizationOut>({
          description_nl: null,
          description_fr: null,
          description_en: null,
          id: Number(params.id),
          name: "Maison Moët & Chandon",
          image: "/images/moet.png",
          website: "https://www.moet.com",
          active: false,
          type: "producer",
          contact_person_id: null,
          contact_person: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        }),
      ),
      http.delete("/api/organizations/:id", ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderOrganizations();
    await screen.findByText("Maison Moët & Chandon");
    fireEvent.click(
      screen.getByRole("button", { name: "admin_content_archive: Maison Moët & Chandon" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "admin_content_archived_section" }));

    const deleteName = 'admin_delete_item({"name":"Maison Moët & Chandon"})';
    fireEvent.click(await screen.findByRole("button", { name: deleteName }));
    const dialog = within(await screen.findByRole("alertdialog"));
    expect(
      dialog.getByText('admin_item_delete_confirm({"name":"Maison Moët & Chandon"})'),
    ).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "admin_action_cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deleted).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: deleteName }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "admin_delete" }),
    );
    await waitFor(() => expect(deleted).toEqual([String(seedOrganizations[0]?.id)]));
  });

  it("writes the server's row into the collection after an archive", async () => {
    server.use(
      http.put("/api/organizations/:id", ({ params }) =>
        jsonResponse<import("@/api-types").OrganizationOut>({
          ...seedOrganizations[0]!,
          id: Number(params.id),
          active: false,
        }),
      ),
    );
    const { collection } = renderOrganizations();
    await screen.findByText("Maison Moët & Chandon");
    fireEvent.click(
      screen.getByRole("button", { name: "admin_content_archive: Maison Moët & Chandon" }),
    );

    await waitFor(() => expect(collection().get(seedOrganizations[0]!.id)?.active).toBe(false));
  });

  it("drops a response that arrives after the session ended", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put("/api/organizations/:id", async ({ params }) => {
        await gate;
        return jsonResponse<import("@/api-types").OrganizationOut>({
          ...seedOrganizations[0]!,
          id: Number(params.id),
          active: false,
        });
      }),
    );
    const { collection } = renderOrganizations();
    await screen.findByText("Maison Moët & Chandon");
    fireEvent.click(
      screen.getByRole("button", { name: "admin_content_archive: Maison Moët & Chandon" }),
    );
    // Sign-out empties the collection while the request is still in flight.
    await resetAdminOrganizationsCollection(collection());
    release();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(collection().has(seedOrganizations[0]!.id)).toBe(false);
  });

  it("creates an organization with a POST that carries no client-side id", async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/organizations", async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return jsonResponse<import("@/api-types").OrganizationOut>({
          ...seedOrganizations[4]!,
          id: 900,
          name: "Nieuwe Wijnboer",
          type: "vendor",
          active: true,
        });
      }),
    );
    const { collection } = renderOrganizations();
    await screen.findByText("Maison Moët & Chandon");
    fireEvent.click(screen.getByRole("button", { name: "admin_content_add_item" }));
    fireEvent.change(await screen.findByLabelText("admin_content_name_placeholder"), {
      target: { value: "Nieuwe Wijnboer" },
    });
    fireEvent.change(screen.getByLabelText("organization_image_label"), {
      target: { value: "/img/new.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));

    expect(await screen.findByText("Nieuwe Wijnboer")).toBeInTheDocument();
    expect(sent).not.toHaveProperty("id");
    expect(sent).toMatchObject({ name: "Nieuwe Wijnboer", image: "/img/new.png", type: "vendor" });
    expect(collection().get(900)?.name).toBe("Nieuwe Wijnboer");
  });

  it("archives every organization of the filtered type one request at a time", async () => {
    const archived: string[] = [];
    server.use(
      http.put("/api/organizations/:id", ({ params }) => {
        archived.push(String(params.id));
        return jsonResponse<import("@/api-types").OrganizationOut>({
          ...seedOrganizations.find((organization) => organization.id === Number(params.id))!,
          active: false,
        });
      }),
    );
    renderOrganizations();
    await screen.findByText("Maison Moët & Chandon");
    fireEvent.click(screen.getByRole("button", { name: "admin_item_sponsor", pressed: false }));
    fireEvent.click(
      screen.getByRole("button", {
        name: 'admin_bulk_content_archive_all({"type":"admin_item_sponsor"})',
      }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "admin_content_archive" }));

    const sponsors = seedOrganizations.filter((organization) => organization.type === "sponsor");
    await waitFor(() => expect(archived.sort()).toEqual(sponsors.map((o) => String(o.id)).sort()));
  });

  it("shows an error alert when loading organizations fails", async () => {
    server.use(
      http.get("/api/organizations", () =>
        HttpResponse.json(
          /* Fixture exception: error response; intentionally outside the success schema. */ {
            detail: "Server error",
          },
          { status: 500 },
        ),
      ),
    );

    renderOrganizations();

    expect(await screen.findByText("admin_content_error_load")).toBeInTheDocument();
  });
});

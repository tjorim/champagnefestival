import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import ContentManagement from "@/components/admin/ContentManagement";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

// GET /api/exhibitors requires a Bearer token recognized by the mock server
// (see `validAdminTokens` in src/mocks/handlers/admin.ts) — an empty headers
// object would 401 and never surface the seeded exhibitors.
const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

function renderContentManagement() {
  const queryClient = createTestQueryClient();
  const onExhibitorSaved = vi.fn();
  const onExhibitorDeleted = vi.fn();
  const onEditionMutated = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <ContentManagement
        authHeaders={authHeaders}
        venues={[]}
        onExhibitorSaved={onExhibitorSaved}
        onExhibitorDeleted={onExhibitorDeleted}
        onEditionMutated={onEditionMutated}
      />
    </QueryClientProvider>,
  );

  return { onExhibitorSaved, onExhibitorDeleted, onEditionMutated };
}

describe("ContentManagement", () => {
  it("renders seeded exhibitors after loading and hides the loading spinner", async () => {
    renderContentManagement();

    expect(screen.getAllByText("admin_content_loading").length).toBeGreaterThan(0);

    expect(await screen.findByText("Maison Moët & Chandon")).toBeInTheDocument();
    expect(screen.getByText("Champagne Bollinger")).toBeInTheDocument();

    expect(screen.queryByText("admin_content_loading")).not.toBeInTheDocument();
  });

  // Primary mutation flow: archiving an exhibitor. We chose this over driving
  // the full ItemModal "add item" form because ItemModal assigns a client-side
  // id via `Date.now()` for new items, which the save API treats as an
  // existing id (`isNew = draft.id <= 0`) and routes to PUT instead of POST —
  // against the mock server that PUT 404s for an id that doesn't exist yet.
  // The archive action is a self-contained PUT against a known, seeded id and
  // exercises the same optimistic-cache-update code path without that
  // complication.
  it("archives an exhibitor: fires a PUT request and moves the item into the archived section", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.put("/api/exhibitors/:id", async ({ request, params }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: Number(params.id),
          name: "Maison Moët & Chandon",
          image: "/images/moet.png",
          website: "https://www.moet.com",
          active: false,
          type: "producer",
          contact_person_id: "person-01",
          contact_person: {
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

    renderContentManagement();

    await screen.findByText("Maison Moët & Chandon");

    const archiveButton = screen.getByRole("button", {
      name: "admin_content_archive Maison Moët & Chandon",
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
    const row = archivedRow.closest(".list-group-item");
    expect(row).not.toBeNull();
    expect(row).toHaveClass("opacity-50");
  });

  it("shows an error alert when loading exhibitors fails", async () => {
    server.use(
      http.get("/api/exhibitors", () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
    );

    renderContentManagement();

    expect(await screen.findByText("admin_content_error_load")).toBeInTheDocument();
  });
});

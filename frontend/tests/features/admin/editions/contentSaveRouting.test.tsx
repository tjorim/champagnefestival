import { jsonResponse } from "@/mocks/response";
/**
 * Regression coverage for how admin content saves are routed and shaped.
 *
 * OrganizationModal used to mint a `Date.now()` id for brand-new organisations,
 * which the save read as "existing" and sent as an update against an id the
 * server had never seen. The modal now hands over `null` for a new one.
 *
 * EditionModal's organization payload is pinned here too: the API rejects vendor
 * ids on an edition, so the form must submit producers and sponsors only.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { http } from "msw/http";
import EditionModal from "@/features/admin/editions/EditionModal";
import OrganizationModal from "@/features/admin/organizations/OrganizationModal";
import { saveOrganization } from "@/lib/api/organizationsApi";
import { seedOrganizations } from "@/mocks/data/organizations";
import { server } from "@/mocks/server";
import type { Edition, OrganizationCreate } from "@/api-types";

import type { Venue } from "@/api-types";
import { createTestQueryClient } from "../../../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

function withQuery(ui: React.ReactElement) {
  return <QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>;
}

describe("new organizations are created, not updated", () => {
  it("OrganizationModal hands over a null id for a new organization so the save routes to POST", async () => {
    const onSave = vi.fn();
    render(
      withQuery(
        <OrganizationModal
          show
          initial={null}
          onSave={onSave}
          onLogoSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText("admin_content_name_placeholder"), {
      target: { value: "New Vendor" },
    });
    fireEvent.change(screen.getByLabelText("organization_image_label"), {
      target: { value: "/img/new.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: /admin_save/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [body, id] = onSave.mock.calls[0]! as [OrganizationCreate, number | null];
    expect(id).toBeNull();

    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => {
      seen.push(`${request.method} ${new URL(request.url).pathname}`);
    });

    const saved = await saveOrganization(id, body);

    expect(seen).toContain("POST /api/organizations");
    expect(seen.some((entry) => entry.startsWith("PUT /api/organizations/"))).toBe(false);
    expect(saved.name).toBe("New Vendor");
    expect(saved.id).toBeGreaterThan(0);
  });
});

describe("saving a festival edition submits only programmable organizations", () => {
  it("leaves vendor ids out of the payload", async () => {
    // The API rejects vendor ids on an edition ("Vendor-type organizations may not
    // be linked to editions"), so an edition that surfaces vendors is already in
    // a state the backend considers invalid. Re-sending them would make the
    // edition permanently unsaveable; omitting them lets the save clear it.
    let submitted: { organizations?: number[] } | null = null;
    server.use(
      http.put("/api/editions/:id", async ({ request }) => {
        submitted = (await request.json()) as { organizations?: number[] };
        return jsonResponse<import("@/api-types").EditionOut>({
          organizations: [],
          producers: [],
          sponsors: [],
          vendors: [],
          co_organizer: null,
          flyer_image: null,
          hero_image: null,
          share_image: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          id: "march-2027",
          year: 2027,
          month: "march",
          edition_type: "festival",
          venue: {
            address: "",
            postal_code: "",
            country: "",
            lat: 0,
            lng: 0,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            id: "venue-01",
            name: "Brussels Expo",
            city: "Brussels",
            active: true,
          },
          dates: [],
          events: [],
          active: true,
        });
      }),
    );

    const editionWithVendors = {
      id: "march-2027",
      year: 2027,
      month: "march",
      edition_type: "festival",
      active: true,
      dates: ["2027-03-06"],
      venue: { id: "venue-01", name: "Brussels Expo", city: "Brussels", active: true },
      events: [],
      producers: [{ id: 1, name: "Mo\u00ebt", image: "", website: "" }],
      sponsors: [],
      vendors: [{ id: 5, name: "Glassware Co", image: "", website: "" }],
    } as unknown as Edition;

    render(
      withQuery(
        <EditionModal
          show
          initial={editionWithVendors}
          venues={
            [{ id: "venue-01", name: "Brussels Expo", city: "Brussels", active: true }] as Venue[]
          }
          organizations={seedOrganizations}
          onSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.queryByText("admin_edition_loading_organizations")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /admin_save/ }));

    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted!.organizations).toContain(1);
    expect(submitted!.organizations).not.toContain(5);
  });
});

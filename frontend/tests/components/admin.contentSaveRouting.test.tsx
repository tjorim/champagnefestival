/**
 * Regression coverage for how admin content saves are routed and shaped.
 *
 * ItemModal used to mint a `Date.now()` id for brand-new items, which
 * `saveContentSectionItem` read as "existing" and sent as an update against an
 * id the server had never seen.
 *
 * EditionModal's exhibitor payload is pinned here too: the API rejects vendor
 * ids on an edition, so the form must submit producers and sponsors only.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import EditionModal from "@/components/admin/EditionModal";
import ItemModal from "@/components/admin/ItemModal";
import { saveContentSectionItem } from "@/utils/adminContentApi";
import { server } from "@/mocks/server";
import type { Edition } from "@/components/admin/editionTypes";
import type { Venue } from "@/types/admin";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

function withQuery(ui: React.ReactElement) {
  return <QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>;
}

describe("new content items are created, not updated", () => {
  it("ItemModal emits id 0 for a new item so the save routes to POST", async () => {
    const onSave = vi.fn();
    render(
      withQuery(
        <ItemModal show initial={null} authHeaders={authHeaders} onSave={onSave} onHide={vi.fn()} />,
      ),
    );

    fireEvent.change(screen.getByLabelText("admin_content_name_placeholder"), {
      target: { value: "New Vendor" },
    });
    fireEvent.change(screen.getByLabelText("admin_content_image_url_placeholder"), {
      target: { value: "/img/new.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: /admin_save/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const draft = onSave.mock.calls[0]![0] as { id: number; name: string };
    expect(draft.id).toBe(0);

    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => {
      seen.push(`${request.method} ${new URL(request.url).pathname}`);
    });

    const saved = await saveContentSectionItem("exhibitors", draft as never, authHeaders);

    expect(seen).toContain("POST /api/exhibitors");
    expect(seen.some((entry) => entry.startsWith("PUT /api/exhibitors/"))).toBe(false);
    expect(saved.name).toBe("New Vendor");
    expect(saved.id).toBeGreaterThan(0);
  });
});

describe("saving a festival edition submits only programmable exhibitors", () => {
  it("leaves vendor ids out of the payload", async () => {
    // The API rejects vendor ids on an edition ("Vendor-type exhibitors may not
    // be linked to editions"), so an edition that surfaces vendors is already in
    // a state the backend considers invalid. Re-sending them would make the
    // edition permanently unsaveable; omitting them lets the save clear it.
    let submitted: { exhibitors?: number[] } | null = null;
    server.use(
      http.put("/api/editions/:id", async ({ request }) => {
        submitted = (await request.json()) as { exhibitors?: number[] };
        return HttpResponse.json({
          id: "march-2027",
          year: 2027,
          month: "march",
          edition_type: "festival",
          venue: { id: "venue-01", name: "Brussels Expo", city: "Brussels", active: true },
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
      editionType: "festival",
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
          authHeaders={authHeaders}
          onSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.queryByText("admin_edition_loading_exhibitors")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /admin_save/ }));

    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted!.exhibitors).toContain(1);
    expect(submitted!.exhibitors).not.toContain(5);
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import EditionPollOptionsModal from "@/components/admin/EditionPollOptionsModal";
import type { Edition } from "@/components/admin/editionTypes";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

const edition: Edition = {
  id: "2026-october",
  year: 2026,
  month: "october",
  editionType: "festival",
  dates: [],
  venue: { id: "venue-1", name: "MEC Staf Versluys", city: "Bredene", active: true },
  events: [],
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderModal(options: Record<string, unknown>[]) {
  server.use(
    http.get("/api/poll-options", ({ request }) => {
      const editionId = new URL(request.url).searchParams.get("edition_id");
      return HttpResponse.json(options.filter((o) => o.edition_id === editionId));
    }),
  );
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <EditionPollOptionsModal show edition={edition} authHeaders={authHeaders} onHide={() => {}} />
    </QueryClientProvider>,
  );
}

describe("EditionPollOptionsModal", () => {
  it("groups existing options by kind", async () => {
    renderModal([
      { id: "opt-1", edition_id: "2026-october", kind: "dish", label: "Vol-au-vent" },
      { id: "opt-2", edition_id: "2026-october", kind: "soup", label: "Tomatensoep" },
      { id: "opt-3", edition_id: "2026-october", kind: "dinner", label: "Donderdag - Cardis" },
    ]);

    expect(await screen.findByText("Vol-au-vent")).toBeInTheDocument();
    expect(screen.getByText("Tomatensoep")).toBeInTheDocument();
    expect(screen.getByText("Donderdag - Cardis")).toBeInTheDocument();
  });

  it("adds a new option", async () => {
    let created: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/poll-options", async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: "opt-new",
            edition_id: created.edition_id,
            kind: created.kind,
            label: created.label,
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderModal([]);

    expect(await screen.findAllByText("admin_poll_no_options")).toHaveLength(3);
    await user.type(screen.getByLabelText("admin_poll_add_label_label"), "Pompoensoep");
    await user.selectOptions(screen.getByLabelText("admin_poll_add_kind_label"), "soup");
    await user.click(screen.getByRole("button", { name: "admin_poll_add_button" }));

    await waitFor(() => expect(screen.getByText("Pompoensoep")).toBeInTheDocument());
    expect(created).toEqual({ edition_id: "2026-october", kind: "soup", label: "Pompoensoep" });
  });

  it("edits an option's label in place", async () => {
    server.use(
      http.put("/api/poll-options/opt-1", async ({ request }) => {
        const body = (await request.json()) as { label: string };
        return HttpResponse.json({
          id: "opt-1",
          edition_id: "2026-october",
          kind: "dish",
          label: body.label,
        });
      }),
    );

    const user = userEvent.setup();
    renderModal([{ id: "opt-1", edition_id: "2026-october", kind: "dish", label: "Vol-au-vent" }]);

    await screen.findByText("Vol-au-vent");
    await user.click(screen.getByRole("button", { name: "admin_edit" }));
    const input = screen.getByDisplayValue("Vol-au-vent");
    await user.clear(input);
    await user.type(input, "Stoofvlees");
    await user.click(screen.getByRole("button", { name: "admin_save" }));

    await waitFor(() => expect(screen.getByText("Stoofvlees")).toBeInTheDocument());
  });

  it("deletes an option after confirmation", async () => {
    let deleteCalled = false;
    server.use(
      http.delete("/api/poll-options/opt-1", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderModal([{ id: "opt-1", edition_id: "2026-october", kind: "dish", label: "Vol-au-vent" }]);

    await screen.findByText("Vol-au-vent");
    await user.click(screen.getByRole("button", { name: "admin_delete" }));
    await user.click(await screen.findByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(screen.queryByText("Vol-au-vent")).not.toBeInTheDocument());
  });
});

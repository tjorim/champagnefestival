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

/** A stored option as the admin API returns it. */
function option(id: string, label: string, totalQuantity = 0, volunteerCount = 0) {
  return {
    id,
    edition_id: "2026-october",
    label,
    total_quantity: totalQuantity,
    volunteer_count: volunteerCount,
  };
}

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
  it("lists the options with what volunteers asked for and the total", async () => {
    renderModal([option("opt-1", "Vol-au-vent", 5, 3), option("opt-2", "Tomatensoep", 4, 2)]);

    expect(await screen.findByText("Vol-au-vent")).toBeInTheDocument();
    expect(screen.getByText("Tomatensoep")).toBeInTheDocument();
    expect(
      screen.getByText('admin_poll_ordered({"quantity":5,"volunteers":3})'),
    ).toBeInTheDocument();
    expect(screen.getByText('admin_poll_total({"quantity":9})')).toBeInTheDocument();
  });

  it("adds a new option with just a label", async () => {
    let created: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/poll-options", async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(option("opt-new", String(created.label)), { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderModal([]);

    expect(await screen.findByText("admin_poll_no_options")).toBeInTheDocument();
    await user.type(screen.getByLabelText("admin_poll_label_label"), "Pompoensoep");
    await user.click(screen.getByRole("button", { name: "admin_poll_add_button" }));

    await waitFor(() => expect(screen.getByText("Pompoensoep")).toBeInTheDocument());
    expect(created).toEqual({ edition_id: "2026-october", label: "Pompoensoep" });
  });

  it("requires a label", async () => {
    const post = vi.fn();
    server.use(
      http.post("/api/poll-options", () => {
        post();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderModal([]);

    await screen.findByText("admin_poll_no_options");
    await user.click(screen.getByRole("button", { name: "admin_poll_add_button" }));

    expect(await screen.findByText("admin_poll_label_required")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("edits an option's label in place", async () => {
    let updated: Record<string, unknown> | null = null;
    server.use(
      http.put("/api/poll-options/opt-1", async ({ request }) => {
        updated = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(option("opt-1", String(updated.label), 5, 3));
      }),
    );

    const user = userEvent.setup();
    renderModal([option("opt-1", "Vol-au-vent", 5, 3)]);

    await screen.findByText("Vol-au-vent");
    await user.click(screen.getByRole("button", { name: "admin_edit" }));
    const input = screen.getByDisplayValue("Vol-au-vent");
    await user.clear(input);
    await user.type(input, "Stoofvlees");
    await user.click(screen.getByRole("button", { name: "admin_save" }));

    await waitFor(() => expect(screen.getByText("Stoofvlees")).toBeInTheDocument());
    expect(updated).toEqual({ label: "Stoofvlees" });
    // Renaming keeps what volunteers already asked for.
    expect(
      screen.getByText('admin_poll_ordered({"quantity":5,"volunteers":3})'),
    ).toBeInTheDocument();
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
    renderModal([option("opt-1", "Vol-au-vent")]);

    await screen.findByText("Vol-au-vent");
    await user.click(screen.getByRole("button", { name: "admin_delete" }));
    await user.click(await screen.findByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(screen.queryByText("Vol-au-vent")).not.toBeInTheDocument());
  });
});

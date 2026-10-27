import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw/http";
import { delay } from "msw/utils/delay";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WaitlistManagement from "@/components/admin/WaitlistManagement";
import { server } from "@/mocks/server";
import { resetAdminTableSearch } from "../helpers/adminTableRouter";
import { selectAdminOptionByLabel } from "../helpers/adminSelect";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock(
  "@tanstack/react-router",
  async () => (await import("../helpers/adminTableRouter")).adminTableRouterMock,
);

const entry = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  handled_at: null as string | null,
  id,
  product_id: "prod-1",
  product_name: "Champagne breakfast",
  event_id: "event-1",
  event_title: "Opening brunch",
  name,
  email: `${name.toLowerCase()}@example.com`,
  phone: null,
  guest_count: 2,
  notes: "",
  created_at: "2026-09-01T10:00:00Z",
  ...extra,
});

const scopes = {
  events: [{ id: "event-1", title: "Opening brunch", outstanding: 2, total: 3 }],
  products: [
    {
      id: "prod-1",
      name: "Champagne breakfast",
      event_id: "event-1",
      event_title: "Opening brunch",
      outstanding: 2,
      total: 3,
    },
  ],
};

let requests: URL[];
let entries: ReturnType<typeof entry>[];

function serve() {
  server.use(
    http.get("/api/waitlist/scopes", () => HttpResponse.json(scopes)),
    http.get("/api/waitlist", ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const status = url.searchParams.get("status");
      const items = entries.filter(
        (item) =>
          status === "all" ||
          (status === "handled" ? item.handled_at !== null : item.handled_at === null),
      );
      return HttpResponse.json({ items, total: items.length, limit: 20, page: 1 });
    }),
  );
}

function renderQueue() {
  return render(<WaitlistManagement authHeaders={() => ({ Authorization: "Bearer test" })} />, {
    wrapper: createTestQueryClientWrapper(),
  });
}

describe("WaitlistManagement", () => {
  beforeEach(() => {
    resetAdminTableSearch();
    requests = [];
    entries = [
      entry("a", "Alice", { notes: "Table by the window" }),
      entry("b", "Bob"),
      entry("c", "Carol", { handled_at: "2026-09-02T10:00:00Z" }),
    ];
    serve();
  });

  it("opens on the not-yet-contacted queue, with the full matching count and the manual-policy note", async () => {
    renderQueue();

    expect(await screen.findAllByText("Alice")).not.toHaveLength(0);
    expect(requests[0]!.searchParams.get("status")).toBe("unhandled");
    expect(screen.queryByText("Carol")).toBeNull();
    expect(screen.getByText("2 results")).toBeInTheDocument();
    expect(screen.getByText(/sends no message, reserves no stock/)).toBeInTheDocument();
  });

  it("shows contacted entries with the explicit view and narrows to one product", async () => {
    renderQueue();
    await screen.findAllByText("Alice");

    await selectAdminOptionByLabel(screen.getByRole("combobox", { name: "Status" }), "All");
    await waitFor(() => expect(requests.at(-1)!.searchParams.get("status")).toBe("all"));
    expect((await screen.findAllByText("Carol")).length).toBeGreaterThan(0);
    // A contacted entry is told apart by text, not only by colour.
    expect(screen.getAllByText("Contacted").length).toBeGreaterThan(0);

    await selectAdminOptionByLabel(
      screen.getByRole("combobox", { name: "Product" }),
      /^Champagne breakfast/,
    );
    await waitFor(() => expect(requests.at(-1)!.searchParams.get("product_id")).toBe("prod-1"));
  });

  it("separates an empty queue from a search with no match", async () => {
    entries = [];
    renderQueue();
    expect(await screen.findByText("Nobody is waiting to be contacted.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search name, email, notes or product"), {
      target: { value: "zzz" },
    });
    expect(await screen.findByText("No waitlist entries match these filters.")).toBeInTheDocument();
    expect(requests.at(-1)!.searchParams.get("q")).toBe("zzz");
  });

  it("shows a load failure with a retry instead of an empty queue", async () => {
    server.use(http.get("/api/waitlist", () => new HttpResponse(null, { status: 500 })));
    renderQueue();
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load the waitlist.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Nobody is waiting to be contacted.")).toBeNull();
  });

  it("submits a pending mark-as-contacted once and announces it", async () => {
    let puts = 0;
    server.use(
      http.put("/api/waitlist/:id/handled", async ({ params }) => {
        puts += 1;
        await delay(50);
        const target = entries.find((item) => item.id === params.id)!;
        target.handled_at = "2026-09-03T10:00:00Z";
        return HttpResponse.json(target);
      }),
    );
    renderQueue();
    await screen.findAllByText("Alice");

    const [button] = screen.getAllByRole("button", { name: "Mark as contacted" });
    fireEvent.click(button!);
    fireEvent.click(button!);
    expect(button).toBeDisabled();

    expect(await screen.findByText("Alice marked as contacted.")).toBeInTheDocument();
    expect(puts).toBe(1);
    await waitFor(() => expect(screen.queryAllByText("Alice")).toHaveLength(0));
  });

  it("keeps a failed mark attached to its entry and lets it be retried", async () => {
    server.use(
      http.put("/api/waitlist/:id/handled", () => new HttpResponse(null, { status: 500 })),
    );
    renderQueue();
    await screen.findAllByText("Alice");

    fireEvent.click(screen.getAllByRole("button", { name: "Mark as contacted" })[0]!);

    expect(await screen.findByText("Couldn't mark Alice as contacted. Try again.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Mark as contacted" })[0]).toBeEnabled();
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
  });

  it("confirms a deletion with the person's and event's context before sending it", async () => {
    let deletes = 0;
    server.use(
      http.delete("/api/waitlist/:id", ({ params }) => {
        deletes += 1;
        entries = entries.filter((item) => item.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderQueue();
    await screen.findAllByText("Alice");

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    const dialog = await screen.findByRole("alertdialog");
    expect(deletes).toBe(0);
    expect(dialog).toHaveTextContent("alice@example.com");
    expect(dialog).toHaveTextContent("Champagne breakfast");
    expect(dialog).toHaveTextContent("Opening brunch");
    expect(dialog).toHaveTextContent("cannot be undone");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deletes).toBe(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    expect(await screen.findByText("Waitlist entry of Alice deleted.")).toBeInTheDocument();
    expect(deletes).toBe(1);
  });

  it("treats a delete of an already-removed entry as done", async () => {
    server.use(
      http.delete("/api/waitlist/:id", () =>
        HttpResponse.json({ detail: "Waitlist entry not found" }, { status: 404 }),
      ),
    );
    renderQueue();
    await screen.findAllByText("Alice");

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    expect(await screen.findByText("Waitlist entry of Alice deleted.")).toBeInTheDocument();
  });
});

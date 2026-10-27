import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw/http";
import { delay } from "msw/utils/delay";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContactMessagesManagement from "@/components/admin/ContactMessagesManagement";
import { server } from "@/mocks/server";
import { resetAdminTableSearch } from "../helpers/adminTableRouter";
import { selectAdminOptionByLabel } from "../helpers/adminSelect";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock(
  "@tanstack/react-router",
  async () => (await import("../helpers/adminTableRouter")).adminTableRouterMock,
);

const message = (id: string, name: string, handled_at: string | null = null) => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  message: `Hello from ${name}`,
  created_at: "2026-09-01T10:00:00Z",
  handled_at,
});

let requests: URL[];
let messages: ReturnType<typeof message>[];

function serve() {
  server.use(
    http.get("/api/contact", ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const status = url.searchParams.get("status");
      const items = messages.filter(
        (item) =>
          status === "all" ||
          (status === "handled" ? item.handled_at !== null : item.handled_at === null),
      );
      return HttpResponse.json({ items, total: items.length, limit: 20, page: 1 });
    }),
  );
}

function renderInbox() {
  return render(
    <ContactMessagesManagement authHeaders={() => ({ Authorization: "Bearer test" })} />,
    { wrapper: createTestQueryClientWrapper() },
  );
}

describe("ContactMessagesManagement", () => {
  beforeEach(() => {
    resetAdminTableSearch();
    requests = [];
    messages = [message("a", "Alice"), message("b", "Bob", "2026-09-02T10:00:00Z")];
    serve();
  });

  it("opens on the unhandled messages and reaches the handled ones through the status filter", async () => {
    renderInbox();
    expect((await screen.findAllByText("Alice")).length).toBeGreaterThan(0);
    expect(requests[0]!.searchParams.get("status")).toBe("unhandled");
    expect(screen.queryByText("Bob")).toBeNull();
    expect(screen.getByText("1 results")).toBeInTheDocument();
    expect(screen.getByText(/sends no reply/)).toBeInTheDocument();

    await selectAdminOptionByLabel(screen.getByRole("combobox", { name: "Status" }), "Handled");
    expect((await screen.findAllByText("Bob")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Handled").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Mark as handled" })).toBeNull();
  });

  it("marks a message once while it is pending, then announces it", async () => {
    let puts = 0;
    server.use(
      http.put("/api/contact/:id/handled", async ({ params }) => {
        puts += 1;
        await delay(50);
        const target = messages.find((item) => item.id === params.id)!;
        target.handled_at = "2026-09-03T10:00:00Z";
        return HttpResponse.json(target);
      }),
    );
    renderInbox();
    await screen.findAllByText("Alice");

    const [button] = screen.getAllByRole("button", { name: "Mark as handled" });
    fireEvent.click(button!);
    fireEvent.click(button!);
    expect(button).toBeDisabled();

    expect(await screen.findByText("Message from Alice marked as handled.")).toBeInTheDocument();
    expect(puts).toBe(1);
    await waitFor(() => expect(screen.queryAllByText("Hello from Alice")).toHaveLength(0));
  });

  it("keeps a failure with its message and offers the action again", async () => {
    server.use(http.put("/api/contact/:id/handled", () => new HttpResponse(null, { status: 500 })));
    renderInbox();
    await screen.findAllByText("Alice");

    fireEvent.click(screen.getAllByRole("button", { name: "Mark as handled" })[0]!);

    expect(
      await screen.findByText("Couldn't mark the message from Alice as handled. Try again."),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Mark as handled" })[0]).toBeEnabled();
  });

  it("separates an empty inbox from a search with no match", async () => {
    messages = [];
    renderInbox();
    expect(await screen.findByText("No messages are waiting to be handled.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search name, email or message"), {
      target: { value: "zzz" },
    });
    expect(await screen.findByText("No contact messages match these filters.")).toBeInTheDocument();
    expect(requests.at(-1)!.searchParams.get("q")).toBe("zzz");
  });

  it("shows a load failure with a retry instead of an empty inbox", async () => {
    server.use(http.get("/api/contact", () => new HttpResponse(null, { status: 500 })));
    renderInbox();

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load contact messages.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("No messages are waiting to be handled.")).toBeNull();
  });
});

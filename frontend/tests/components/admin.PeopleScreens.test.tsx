import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import MembersManagement from "@/components/admin/MembersManagement";
import VolunteersManagement from "@/components/admin/VolunteersManagement";
import PeopleManagement from "@/components/admin/PeopleManagement";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy(
    {},
    {
      get: (_target, key) => (args?: unknown) =>
        args ? `${String(key)}(${JSON.stringify(args)})` : String(key),
    },
  ),
}));
const download = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/utils/adminApi", async (original) => ({
  ...(await original<typeof import("@/utils/adminApi")>()),
  downloadFileOrThrow: download,
}));
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer mock-access-token",
});
const person = (index: number) => ({
  id: `p${index}`,
  name: `Person ${String(index).padStart(2, "0")}`,
  email: `p${index}@example.com`,
  phone: "0470000000",
  address: "Street",
  club_name: "Club",
  notes: "Notes",
  active: index % 2 === 0,
  roles: ["member", "volunteer"],
  registration_count: 42,
  national_register_number: "123456",
  eid_document_number: "eid",
  help_periods: [{ id: index, first_help_day: "2026-10-01", last_help_day: null, notes: "Help" }],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});
function mount(kind: "people" | "members" | "volunteers", count = 25) {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onMerge = vi.fn().mockResolvedValue(undefined);
  const requests: URL[] = [];
  const rows = Array.from({ length: count }, (_, index) => person(index));
  const handler = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    requests.push(url);
    let matching = rows.filter(
      (row) =>
        (!url.searchParams.get("q") || row.name.includes(url.searchParams.get("q")!)) &&
        (!url.searchParams.has("active") ||
          row.active === (url.searchParams.get("active") === "true")),
    );
    if (url.searchParams.get("sort_dir") === "desc") matching = matching.slice().reverse();
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    return HttpResponse.json({
      items: matching.slice((page - 1) * limit, page * limit),
      total: matching.length,
      page,
      limit,
    });
  };
  server.use(
    http.get("/api/people", handler),
    http.get("/api/volunteers", handler),
    http.get("/api/people/by-email", () =>
      HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
    ),
  );
  const queryClient = createTestQueryClient();
  const component = () =>
    kind === "people" ? (
      <PeopleManagement {...{ authHeaders, onCreate, onUpdate, onDelete, onMerge }} />
    ) : kind === "members" ? (
      <MembersManagement {...{ authHeaders, onCreate, onUpdate, onDelete }} />
    ) : (
      <VolunteersManagement {...{ authHeaders, onCreate, onUpdate, onDelete }} />
    );
  const root = createRootRoute({ component, validateSearch: (search) => search });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient, onCreate, onUpdate, onDelete, onMerge, requests };
}
const row = (name: string) => screen.getByRole("row", { name });

describe.each(["people", "members", "volunteers"] as const)("%s server screen", (kind) => {
  it("loads bounded pages and keeps full-result totals and existing column preferences", async () => {
    localStorage.setItem(`admin-col-vis-${kind}`, JSON.stringify({ phone: false }));
    const h = mount(kind);
    await screen.findByRole("row", { name: "Person 00" });
    expect(within(row("Person 00")).queryByText("0470000000")).not.toBeInTheDocument();
    expect(screen.getByText('admin_table_results({"total":25})')).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: "Person 20" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /admin_table_page_next/ }));
    await screen.findByRole("row", { name: "Person 20" });
    expect(h.requests.at(-1)?.searchParams.get("page")).toBe("2");
    expect(h.requests.every((url) => Number(url.searchParams.get("limit")) <= 100)).toBe(true);
  });

  it("opens edit, submits the existing form and leaves the table state intact", async () => {
    const h = mount(kind);
    await screen.findByRole("row", { name: "Person 00" });
    fireEvent.click(
      within(row("Person 00")).getByRole("button", { name: `admin_${kind}_edit_title` }),
    );
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText(/registration_name/);
    fireEvent.change(name, { target: { value: "Edited person" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /admin_people_save/ }));
    await waitFor(() =>
      expect(h.onUpdate).toHaveBeenCalledWith(
        "p0",
        expect.objectContaining({ name: "Edited person" }),
      ),
    );
  });

  it("keeps a refused delete error in its modal", async () => {
    const h = mount(kind);
    h.onDelete.mockRejectedValue(new Error("Server refused"));
    await screen.findByRole("row", { name: "Person 00" });
    fireEvent.click(
      within(row("Person 00")).getByRole("button", { name: `admin_${kind}_delete_title` }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: kind === "members" ? "admin_members_delete_title" : "admin_action_confirm",
      }),
    );
    await within(dialog).findByText("Server refused");
    expect(h.onDelete).toHaveBeenCalledWith("p0");
  });

  it("sends active filters, search, sort and exports to the server", async () => {
    const h = mount(kind);
    await screen.findByRole("row", { name: "Person 00" });
    fireEvent.click(screen.getAllByRole("button", { name: /registration_name/ })[0]!);
    await waitFor(() => expect(h.requests.at(-1)?.searchParams.get("sort")).toBe("name"));
    fireEvent.click(screen.getByRole("combobox", { name: "admin_people_active_label" }));
    const inactive = await screen.findByRole("option", { name: /admin_members_filter_inactive/ });
    fireEvent.pointerDown(inactive, { pointerType: "mouse" });
    fireEvent.click(inactive);
    await screen.findByRole("row", { name: "Person 01" });
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: "Person 00" })).not.toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "admin_search_person_placeholder" }), {
      target: { value: "Person 01" },
    });
    await waitFor(() => expect(h.requests.at(-1)?.searchParams.get("q")).toBe("Person 01"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "admin_export_csv" })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "admin_export_csv" }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    const url = new URL(download.mock.calls.at(-1)![0] as string, "http://localhost");
    expect(url.pathname).toBe(
      kind === "volunteers" ? "/api/volunteers/export" : "/api/people/export",
    );
    expect(url.searchParams.get("q")).toBe("Person 01");
    expect(url.searchParams.get("active")).toBe("false");
    expect(url.searchParams.has("page")).toBe(false);
    if (kind === "volunteers") expect(url.searchParams.get("include_inactive")).toBe("true");
  });
});
it("exports all volunteers including inactive rows when no active filter is selected", async () => {
  mount("volunteers");
  await screen.findByRole("row", { name: "Person 00" });
  fireEvent.click(screen.getByRole("button", { name: "admin_export_csv" }));
  await waitFor(() => expect(download).toHaveBeenCalled());
  const url = new URL(download.mock.calls.at(-1)![0] as string, "http://localhost");
  expect(url.searchParams.has("active")).toBe(false);
  expect(url.searchParams.get("include_inactive")).toBe("true");
});
it("uses exact bounded duplicate lookup and merges with server registration counts", async () => {
  const h = mount("people", 1);
  server.use(
    http.get("/api/people/by-email", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("email")).toBe("p0@example.com");
      expect(url.searchParams.get("limit")).toBe("100");
      return HttpResponse.json({
        items: [{ ...person(1), registration_count: 100 }],
        total: 1,
        page: 1,
        limit: 100,
      });
    }),
  );
  const personRow = await screen.findByRole("row", { name: "Person 00" });
  fireEvent.click(
    await within(personRow).findByRole("button", { name: "admin_people_merge_title: Person 01" }),
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /admin_people_merge_confirm/ }));
  await waitFor(() => expect(h.onMerge).toHaveBeenCalledWith("p1", "p0"));
});
it("preserves email composition and the registration/payment summary view", async () => {
  mount("people", 1);
  const personRow = await screen.findByRole("row", { name: "Person 00" });
  fireEvent.click(within(personRow).getByRole("button", { name: /admin_email_compose_for/ }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});
it("has no accessibility violations", async () => {
  const h = mount("people", 1);
  await screen.findByRole("row", { name: "Person 00" });
  expect(await axe(h.container)).toHaveNoViolations();
});

it("copies all matching emails only on the explicit action, through bounded pages", async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: copy }, configurable: true });
  const h = mount("people", 205);
  await screen.findByRole("row", { name: "Person 00" });
  expect(h.requests).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "admin_people_copy_emails_tooltip" }));
  await waitFor(() => expect(copy).toHaveBeenCalled());
  const emails = (copy.mock.calls[0]![0] as string).split(", ");
  expect(emails).toHaveLength(205);
  expect(emails.at(-1)).toBe("p204@example.com");
  expect(h.requests.slice(1).map((url) => url.searchParams.get("page"))).toEqual(["1", "2", "3"]);
});

it("loads the person registration and payment summary independently of the list page", async () => {
  mount("people", 1);
  server.use(
    http.get("/api/people/:id/registrations", () => HttpResponse.json([])),
    http.get("/api/people/:id/payment-summary", () =>
      HttpResponse.json({
        total_received: 0,
        total_refunded: 0,
        total_paid: 0,
        total_outstanding: 0,
      }),
    ),
  );
  const personRow = await screen.findByRole("row", { name: "Person 00" });
  fireEvent.click(
    within(personRow).getByRole("button", { name: /admin_people_view_registrations/ }),
  );
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("admin_people_registrations_empty");
});

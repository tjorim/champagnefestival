import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAppColumnHelper } from "@/hooks/useAdminTable";
import { readAdminTableState } from "@/utils/adminTableState";
import { AdminDataTable } from "./AdminDataTable";
const route = vi.hoisted(() => ({ search: {} as Record<string, unknown>, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => route.search,
  useNavigate: () => route.navigate,
}));
type Person = { id: string; name: string };
const helper = createAppColumnHelper<Person>();
const columns = [helper.accessor("name", { header: "Name" })];
const labels = {
  caption: "People",
  search: "Search",
  sort: "Sort",
  clear: "Clear",
  loading: "Loading",
  empty: "No results",
  error: "Failed",
  retry: "Retry",
  open: "Open",
  actions: "Actions",
  export: "Export",
  selectAll: "Select all matching",
  results: (total: number) => `${total} results`,
};
const source = vi.fn(() => ({
  data: {
    items: [
      { id: "2", name: "Zoe" },
      { id: "1", name: "Ada" },
    ],
    total: 100,
  },
  isFetching: false,
  refetch: vi.fn(),
}));
const onOpen = vi.fn();
function mount(extra = {}) {
  return render(
    <AdminDataTable
      id="people"
      columns={columns}
      useDataSource={source}
      columnVisibilityKey="people-columns"
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.name}
      onOpen={onOpen}
      renderCard={(row) => row.name}
      labels={labels}
      {...extra}
    />,
  );
}
beforeEach(() => {
  route.search = {
    unrelated: "keep",
    table_people: { page: 2, pageSize: 20, search: "absent", sort: "name", sortDir: "asc" },
  };
  route.navigate.mockImplementation(({ search }) => {
    route.search = search(route.search);
  });
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("passes URL state to the source without sorting, filtering or slicing its page", () => {
  mount();
  expect(source).toHaveBeenCalledWith(readAdminTableState(route.search.table_people));
  const rows = screen.getAllByRole("row");
  expect(rows[1]!.textContent).toContain("Zoe");
  expect(rows[2]!.textContent).toContain("Ada");
  expect(screen.getByText("100 results")).toBeTruthy();
});
it("debounces search and resets the page while preserving unrelated params", () => {
  vi.useFakeTimers();
  mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "Ada" } });
  expect(route.navigate).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(300));
  expect(readAdminTableState(route.search.table_people)).toMatchObject({ page: 0, search: "Ada" });
  expect(route.search.unrelated).toBe("keep");
});
it("resets sorting to page one and provides labelled record actions", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Name" }));
  expect(readAdminTableState(route.search.table_people)).toMatchObject({
    page: 0,
    sortDir: "desc",
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Open: Zoe" })[0]!);
  expect(onOpen).toHaveBeenCalledWith({ id: "2", name: "Zoe" });
});
it("retains placeholder rows while loading", () => {
  mount({ useDataSource: () => ({ ...source(), isFetching: true, isPlaceholderData: true }) });
  expect(screen.getAllByText("Zoe").length).toBeGreaterThan(0);
  expect(screen.getByText("Loading")).toBeTruthy();
});
it("exports the full matching state", () => {
  const onExport = vi.fn(async () => {});
  mount({ onExport });
  fireEvent.click(screen.getByText("Export"));
  expect(onExport).toHaveBeenCalledWith(readAdminTableState(route.search.table_people));
});
it("validates malformed route state", () => {
  expect(
    readAdminTableState({ page: -1, pageSize: 1000, filters: { good: "yes", bad: false } }),
  ).toMatchObject({ page: 0, pageSize: 20, filters: { good: "yes" } });
});
it("supports keyboard row movement and opening", () => {
  mount();
  const rows = screen.getAllByRole("row");
  rows[1]!.focus();
  fireEvent.keyDown(rows[1]!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(rows[2]!);
  fireEvent.keyDown(rows[2]!, { key: "Enter" });
  expect(onOpen).toHaveBeenCalledWith({ id: "1", name: "Ada" });
});
it("filters and clears through URL state", () => {
  route.search.table_people = { page: 4, filters: { status: "active" } };
  mount({
    filters: [{ id: "status", label: "Status", options: [{ value: "active", label: "Active" }] }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Status: Active ×" }));
  expect(readAdminTableState(route.search.table_people)).toMatchObject({ page: 0, filters: {} });
});
it("restores existing saved column preferences", () => {
  localStorage.setItem("people-columns", JSON.stringify({ name: false, obsolete: false }));
  mount();
  expect(screen.queryByRole("button", { name: "Name" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Open: Zoe" }).length).toBe(2);
});
it("does not invoke a row write before confirmation", async () => {
  const run = vi.fn(async () => {});
  mount({ actions: [{ label: "Remove", confirmation: "Remove this person?", run }] });
  fireEvent.click(screen.getAllByRole("button", { name: "Actions: Zoe" })[0]!);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
  expect(run).not.toHaveBeenCalled();
  expect(await screen.findByText("Remove this person?")).toBeTruthy();
});
it("preserves route state across a data refresh", () => {
  const view = mount();
  const before = structuredClone(route.search);
  view.rerender(
    <AdminDataTable
      id="people"
      columns={columns}
      useDataSource={source}
      columnVisibilityKey="people-columns"
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.name}
      onOpen={onOpen}
      renderCard={(row) => row.name}
      labels={labels}
    />,
  );
  expect(route.search).toEqual(before);
  expect(route.navigate).not.toHaveBeenCalled();
});
it("renders retryable source errors", () => {
  const refetch = vi.fn();
  mount({ useDataSource: () => ({ isFetching: false, isError: true, refetch }) });
  expect(screen.getByRole("alert").textContent).toContain("Failed");
  fireEvent.click(screen.getByText("Retry"));
  expect(refetch).toHaveBeenCalledOnce();
});
it("round-trips table state through Router JSON search serialisation", async () => {
  const { defaultParseSearch, defaultStringifySearch } =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  const original = {
    table_people: {
      page: 3,
      pageSize: 50,
      sort: "name",
      sortDir: "desc",
      search: "A & B",
      filters: { status: "active" },
    },
    table_people_columns: { name: false },
    unrelated: "keep",
  };
  expect(defaultParseSearch(defaultStringifySearch(original))).toEqual(original);
});

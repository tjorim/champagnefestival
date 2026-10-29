import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PersonDirectoryMatches } from "./PersonDirectoryMatches";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";
const guest = { id: "existing", name: "Existing guest", email: "guest@example.com" } as Person;
const query = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePeopleListQuery", () => ({
  usePeopleListQuery: (...args: unknown[]) => query(...args),
}));
afterEach(cleanup);
it("offers reuse and deliberate separate creation from authorised search results", async () => {
  query.mockReturnValue({ data: { items: [guest] }, isPlaceholderData: false });
  const reuse = vi.fn();
  const headers = () => ({ Authorization: "Bearer test" });
  render(
    <PersonDirectoryMatches
      name="Guest"
      email="guest@example.com"
      authHeaders={headers}
      onReuse={reuse}
    />,
  );
  await waitFor(() => expect(screen.getByText(m.admin_person_continue_help())).toBeTruthy());
  expect(query).toHaveBeenLastCalledWith(
    { page: 1, limit: 5, q: "guest@example.com" },
    headers,
    true,
  );
  await userEvent.click(screen.getByRole("button", { name: m.admin_person_reuse() }));
  expect(reuse).toHaveBeenCalledWith(guest);
});
it("warns instead of staying silent when the directory search fails", () => {
  query.mockReturnValue({ data: undefined, isPlaceholderData: false, isError: true });
  render(
    <PersonDirectoryMatches
      name="Guest"
      email="guest@example.com"
      authHeaders={() => ({})}
      onReuse={vi.fn()}
    />,
  );
  return waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(m.admin_person_matches_unavailable()),
  );
});
it("does not offer stale placeholder matches", async () => {
  query.mockReturnValue({ data: { items: [guest] }, isPlaceholderData: true });
  render(
    <PersonDirectoryMatches
      name="Guest"
      email="guest@example.com"
      authHeaders={() => ({})}
      onReuse={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
});

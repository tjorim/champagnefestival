import { useSyncExternalStore } from "react";

/**
 * A minimal stand-in for the router's search state, so a table that keeps its
 * paging and filters in the URL re-renders when it navigates.
 */
let search: Record<string, unknown> = {};
const listeners = new Set<() => void>();

export function resetAdminTableSearch(next: Record<string, unknown> = {}) {
  search = next;
  listeners.forEach((listener) => listener());
}

export const adminTableRouterMock = {
  useSearch: () =>
    useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      () => search,
    ),
  useNavigate: () => (options: { search: (previous: Record<string, unknown>) => unknown }) => {
    search = options.search(search) as Record<string, unknown>;
    listeners.forEach((listener) => listener());
    return Promise.resolve();
  },
};

import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";

export async function renderLocation(
  element: ReactNode,
  entry = "/admin",
  wrapper?: React.ComponentType<{ children: ReactNode }>,
) {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: entry.split("?")[0] ?? "/admin",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => element,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  await router.load();
  render(<RouterProvider router={router} />, { wrapper });
  return router;
}

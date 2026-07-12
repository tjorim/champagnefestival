import type { RouteComponent } from "@tanstack/react-router";
import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { LiveUpdatesProvider } from "./state/LiveUpdatesProvider";

export interface CheckInSearch {
  id?: string;
  token?: string;
}

export interface MyRegistrationsSearch {
  token?: string;
}

export function validateCheckInSearch(search: Record<string, unknown>): CheckInSearch {
  return {
    id: typeof search.id === "string" ? search.id : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  };
}

export function validateMyRegistrationsSearch(
  search: Record<string, unknown>,
): MyRegistrationsSearch {
  return {
    token: typeof search.token === "string" ? search.token : undefined,
  };
}

interface AppRouteComponents {
  App: RouteComponent;
  AdminPage: RouteComponent;
  CheckInRoute: RouteComponent;
  MyRegistrationsRoute: RouteComponent;
  PrivacyPolicyRoute: RouteComponent;
}

export function createAppRouter({
  App,
  AdminPage,
  CheckInRoute,
  MyRegistrationsRoute,
  PrivacyPolicyRoute,
}: AppRouteComponents) {
  const rootRoute = createRootRoute({
    notFoundComponent: App,
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: App,
  });

  const adminLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "admin-layout",
    component: () => (
      <>
        <LiveUpdatesProvider />
        <Outlet />
      </>
    ),
  });

  const adminRoute = createRoute({
    getParentRoute: () => adminLayoutRoute,
    path: "/admin",
    component: AdminPage,
  });

  const checkInRoute = createRoute({
    getParentRoute: () => adminLayoutRoute,
    path: "/check-in",
    validateSearch: validateCheckInSearch,
    component: CheckInRoute,
  });

  const myRegistrationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/my-registrations",
    validateSearch: validateMyRegistrationsSearch,
    component: MyRegistrationsRoute,
  });

  const privacyPolicyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/privacy",
    component: PrivacyPolicyRoute,
  });

  const routeTree = rootRoute.addChildren([
    indexRoute,
    adminLayoutRoute.addChildren([adminRoute, checkInRoute]),
    myRegistrationsRoute,
    privacyPolicyRoute,
  ]);

  return createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL,
  });
}

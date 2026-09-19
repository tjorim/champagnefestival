import type { QueryClient } from "@tanstack/react-query";
import type { RouteComponent } from "@tanstack/react-router";
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { LiveUpdatesProvider } from "./state/LiveUpdatesProvider";
import { getStoredAccessToken } from "./config/oidc";
import { venuePlanQueryOptions } from "./utils/venuePlanApi";

interface RouterContext {
  queryClient: QueryClient;
}

export interface CheckInSearch {
  id?: string;
}

export interface MyRegistrationsSearch {
  token?: string;
}
export interface VenuePlanSearch {
  edition?: string;
  table?: string;
}

export function validateCheckInSearch(search: Record<string, unknown>): CheckInSearch {
  return {
    id: typeof search.id === "string" ? search.id : undefined,
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
  PrivacyPolicyRoute: RouteComponent;
  PebblePairRoute: RouteComponent;
  MyAccountRoute: RouteComponent;
  VenuePlanRoute: RouteComponent;
}

export function createAppRouter({
  App,
  AdminPage,
  CheckInRoute,
  PrivacyPolicyRoute,
  PebblePairRoute,
  MyAccountRoute,
  VenuePlanRoute,
  queryClient,
}: AppRouteComponents & { queryClient: QueryClient }) {
  const rootRoute = createRootRouteWithContext<RouterContext>()({
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
  const venuePlanRoute = createRoute({
    getParentRoute: () => adminLayoutRoute,
    path: "/venue-plan",
    validateSearch: (search: Record<string, unknown>): VenuePlanSearch => ({
      edition: typeof search.edition === "string" ? search.edition : undefined,
      table: typeof search.table === "string" ? search.table : undefined,
    }),
    loaderDeps: ({ search: { edition } }: { search: VenuePlanSearch }) => ({ edition }),
    context: ({ deps }) => {
      const token = getStoredAccessToken();
      return {
        venuePlanQueryOptions:
          deps.edition && token
            ? venuePlanQueryOptions(deps.edition, () => ({ Authorization: `Bearer ${token}` }))
            : undefined,
      };
    },
    loader: async ({ context }) => {
      // Best-effort prefetch only: no edition yet, or no/expired stored
      // session (role-gating still happens client-side in VenuePlanPage,
      // same as before) — just skip warming the cache, never throw and
      // block the navigation over it.
      if (!context.venuePlanQueryOptions) return;
      try {
        await context.queryClient.ensureQueryData(context.venuePlanQueryOptions);
      } catch {
        // Swallowed deliberately — VenuePlanPage's own useQuery (sharing the
        // exact same queryOptions) still runs normally and surfaces any real
        // error through its existing inline Alert.
      }
    },
    component: VenuePlanRoute,
  });

  const privacyPolicyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/privacy",
    component: PrivacyPolicyRoute,
  });

  const pebblePairRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pebble-pair",
    component: PebblePairRoute,
  });

  const myAccountRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/me",
    validateSearch: validateMyRegistrationsSearch,
    component: MyAccountRoute,
  });

  const routeTree = rootRoute.addChildren([
    indexRoute,
    adminLayoutRoute.addChildren([adminRoute, checkInRoute, venuePlanRoute]),
    privacyPolicyRoute,
    pebblePairRoute,
    myAccountRoute,
  ]);

  return createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL,
    context: { queryClient },
  });
}

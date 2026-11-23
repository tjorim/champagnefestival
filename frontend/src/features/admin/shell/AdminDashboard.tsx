import { AdminWorkspaceContext } from "./AdminWorkspace";
import { adminSectionKeys, getAdminSection } from "./adminSections";
import { formatNumber } from "@/lib/format/numberUtils";
import { getLocale } from "@/paraglide/runtime";
import { formatDateTime } from "@/lib/format/dateUtils";
import { useSearch } from "@tanstack/react-router";
import { useLocationChoice } from "@/hooks/useLocationChoice";
import { useSyncExternalStore } from "react";
import { adminCachePersistence } from "@/lib/collections/adminCachePersistence";
import { AdminCacheStatus } from "./AdminCacheStatus";
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/app/providers/AuthContext";
import { m } from "@/paraglide/messages";
import "./admin.css";
import {
  summarizeGuestCheckIns,
  useVolunteerCheckInStats,
} from "../registrations/useRegistrationListQuery";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AdminSidebar from "./AdminSidebar";
import AdminLoginForm from "./AdminLoginForm";
import AdminSkeleton, { skeletonVariantForSection } from "./AdminSkeleton";
import type { Registration } from "@/types/registration";
import { useActiveEdition } from "@/hooks/useActiveEdition";
import { useAdminDashboardData } from "./useAdminDashboardData";
import { useAdminQueries } from "./useAdminQueries";
import { useAdminSessionRecovery } from "./useAdminSessionRecovery";
import { devError } from "@/lib/devLog";
import { recordSignOutReason } from "./signOutReason";
import AdminSectionPane from "./AdminSectionPane";
import { editionDisplayNameWithType } from "@/lib/editions/editionName";

interface AdminDashboardProps {
  visible: boolean;
}

export default function AdminDashboard({ visible }: AdminDashboardProps) {
  // "any" rather than the public festival scope: floor plans and the event-day
  // views have to follow whichever edition is next, including a bourse.
  const { edition: activeEdition, isLoaded: activeEditionLoaded } = useActiveEdition("any");
  const queryClient = useQueryClient();
  const cache = adminCachePersistence(queryClient);
  const cacheStatus = useSyncExternalStore(cache.subscribe, cache.getSnapshot);
  const auth = useAuth();
  const navRef = useRef<HTMLElement>(null);

  const isAuthenticated = auth.isAuthenticated;
  const { renewSession } = auth;
  const canManageAdminSections = auth.hasRole("admin");
  const [globalError, setGlobalError] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [applyActiveEditionFilterRequest, setApplyActiveEditionFilterRequest] = useState(0);
  /** Full registration (with checkInToken) shown in the detail modal */
  const [detailRegistration, setDetailRegistration] = useState<Registration | null>(null);

  // Sidebar navigation state
  const locationSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const [activeKey, setActiveKey] = useLocationChoice("section", adminSectionKeys, "home");
  // A non-admin who lands on a restricted section (stale state, a role
  // downgrade) has nothing to show there — derive the fallback for render
  // instead of resetting `activeKey` itself in an effect, which loses one
  // render to a blank content pane before it takes effect.
  const effectiveActiveKey =
    canManageAdminSections || getAdminSection(activeKey).staff ? activeKey : "registrations";
  const section = getAdminSection(effectiveActiveKey);
  const Section = section.component;

  // `expandedGroups` is the only source of truth for what is open, so a group holding the
  // active section can still be collapsed. Navigating to a section expands its group, adjusted
  // during render (comparing against the previous key) rather than in an effect.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const group = section.group;
    return new Set(group ? [group] : []);
  });
  const [expandedForKey, setExpandedForKey] = useState(effectiveActiveKey);
  if (expandedForKey !== effectiveActiveKey) {
    setExpandedForKey(effectiveActiveKey);
    const group = section.group;
    if (group && !expandedGroups.has(group)) setExpandedGroups(new Set(expandedGroups).add(group));
  }

  useEffect(() => {
    if (!visible || !isAuthenticated) return;
    const label = section.label();
    if (label) document.title = `${label} — ${m.admin_title()}`;
    if (!window.location.hash.startsWith("#audit-")) {
      document.getElementById("admin-content")?.focus({ preventScroll: true });
    }
  }, [section, visible, isAuthenticated]);

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const queries = useAdminQueries({
    editionId: activeEdition.id,
    activeEditionLoaded,
    visible,
    isAuthenticated,
    canManageAdminSections,
    accountId: auth.accountId,
  });
  const {
    registrationsQuery,
    registrationCountsQuery,
    tablesQuery,
    venuesQuery,
    roomsQuery,
    tableTypesQuery,
    layoutsQuery,
    organizationsQuery,
    areasQuery,
    peopleCountsQuery,
    isAnyPending,
    isAnyFetching,
    refreshDashboard,
  } = queries;

  const refresh = useCallback(async () => {
    setGlobalError("");
    await refreshDashboard();
  }, [refreshDashboard]);

  const { activeDayIndex, activeEditionDateKeys, eventsToday, isActiveEditionDay } =
    useAdminDashboardData(activeEdition);
  const volunteerStats = useVolunteerCheckInStats(
    visible && isAuthenticated && !canManageAdminSections,
  );
  const editionEvents = canManageAdminSections
    ? registrationCountsQuery.data?.events.filter((event) => event.edition_id === activeEdition.id)
    : volunteerStats.data?.filter((event) =>
        activeEdition.events.some(({ id }) => id === event.event_id),
      );

  const handleLogout = useCallback(() => {
    setDetailRegistration(null);
    auth.logout();
  }, [auth]);

  // A stable array so the recovery hook's effect only re-runs when one of the
  // underlying query errors actually changes, not on every render.
  const dashboardQueryErrors = useMemo(
    (): (Error | null)[] => [
      // Every error comes from a tanstack-db collection's lastError, typed
      // loosely by the library; each is an Error instance or null at runtime.
      registrationsQuery.error as Error | null,
      tablesQuery.error as Error | null,
      venuesQuery.error as Error | null,
      roomsQuery.error as Error | null,
      tableTypesQuery.error as Error | null,
      layoutsQuery.error as Error | null,
      organizationsQuery.error as Error | null,
      areasQuery.error as Error | null,
      peopleCountsQuery.error as Error | null,
    ],
    [
      registrationsQuery.error,
      tablesQuery.error,
      venuesQuery.error,
      roomsQuery.error,
      tableTypesQuery.error,
      layoutsQuery.error,
      organizationsQuery.error,
      areasQuery.error,
      peopleCountsQuery.error,
    ],
  );

  const handleSessionExpired = useCallback(() => {
    // Record why, so the login screen explains the session ended instead of
    // silently appearing mid-task.
    recordSignOutReason("session-expired");
    handleLogout();
  }, [handleLogout]);

  const { isRenewingSession, loadError } = useAdminSessionRecovery({
    errors: dashboardQueryErrors,
    renewSession,
    refresh,
    onSignOut: handleSessionExpired,
  });

  // globalError can also be dismissed independently of loadError (see the
  // Alert below), so it can't be a pure derivation — adjust it during render
  // only on the transitions of loadError itself, rather than in an effect.
  const [prevLoadError, setPrevLoadError] = useState(loadError);
  if (loadError !== prevLoadError) {
    setPrevLoadError(loadError);
    if (loadError) {
      devError("Failed to load dashboard data", loadError);
      setGlobalError(m.admin_error_load_data());
    } else {
      setGlobalError("");
    }
  }

  const handleNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (!navRef.current) return;
    const buttons = Array.from(
      navRef.current.querySelectorAll<HTMLButtonElement>('[data-sidebar="menu-button"]'),
    );
    const focused = document.activeElement;
    const idx = buttons.indexOf(focused as HTMLButtonElement);
    if (idx === -1) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }, []);

  if (!visible) return null;

  if (auth.isLoading) {
    return (
      <div className="py-12 text-center">
        <Spinner variant="warning" role="status">
          <span className="sr-only">{m.admin_loading()}</span>
        </Spinner>
      </div>
    );
  }

  return (
    <section
      id="admin"
      data-theme-scope="admin"
      data-theme-mode="dark"
      aria-labelledby="admin-title"
      className={isAuthenticated ? "admin-authenticated" : "py-12"}
    >
      {/* The signed-out login form renders its own visible #admin-title heading. */}
      {isAuthenticated && (
        <h2 id="admin-title" className="sr-only">
          {m.admin_title()}
        </h2>
      )}
      {!isAuthenticated ? (
        /* ---- Login (OIDC redirect) ---- */
        <AdminLoginForm />
      ) : (
        <AdminWorkspaceContext.Provider
          value={{
            queries,
            activeEdition,
            activeEditionLoaded,
            canManageAdminSections,
            applyActiveEditionFilterRequest,
            detailRegistration,
            setDetailRegistration,
            registrationError,
            setRegistrationError,
          }}
        >
          {/* Authenticated sidebar layout */}
          <SidebarProvider belowHeader className="admin-layout">
            <AdminSidebar
              activeKey={effectiveActiveKey}
              setActiveKey={setActiveKey}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              navRef={navRef}
              handleNavKeyDown={handleNavKeyDown}
              registrationCount={registrationCountsQuery.data?.all ?? 0}
              peopleCount={peopleCountsQuery.data?.total ?? 0}
              isAnyFetching={isAnyFetching}
              onRefresh={refresh}
              onLogout={handleLogout}
              accountLabel={auth.accountLabel}
              isSigningOut={auth.isSigningOut}
              canManageAdminSections={canManageAdminSections}
              lastSynced={
                cacheStatus.lastSynced ? formatDateTime(cacheStatus.lastSynced, getLocale()) : null
              }
            />

            {/* Main content */}
            <div className="admin-main" id="admin-content" tabIndex={-1}>
              <div className="mb-3 flex items-center gap-3 site-lg:hidden">
                <SidebarTrigger className="size-11 border border-border bg-sidebar" />
                <span className="text-sm text-foreground">{m.admin_toggle_navigation()}</span>
              </div>
              <AdminCacheStatus />
              {locationSearch.section !== undefined &&
                (locationSearch.section !== activeKey || effectiveActiveKey !== activeKey) && (
                  <Alert variant="info" className="mb-4">
                    {m.navigation_destination_unavailable()}
                  </Alert>
                )}
              {activeEdition.id !== "" && activeEdition.year > 0 && section.activeEdition && (
                <button
                  type="button"
                  className="admin-active-edition-strip text-left mb-4"
                  onClick={() => {
                    setActiveKey("registrations");
                    setApplyActiveEditionFilterRequest((current) => current + 1);
                  }}
                  title={m.admin_active_edition_apply_filter()}
                >
                  <span className="font-semibold">{editionDisplayNameWithType(activeEdition)}</span>
                  {isActiveEditionDay && (
                    <span className="text-highlight">
                      {m.admin_active_edition_day_progress({
                        current: formatNumber(activeDayIndex + 1, getLocale()),
                        total: formatNumber(activeEditionDateKeys.length, getLocale()),
                      })}
                    </span>
                  )}
                  {editionEvents && (
                    <span>
                      {m.admin_active_edition_checkins({
                        checkedIn: formatNumber(
                          summarizeGuestCheckIns(editionEvents).checkedIn,
                          getLocale(),
                        ),
                        total: formatNumber(
                          summarizeGuestCheckIns(editionEvents).total,
                          getLocale(),
                        ),
                      })}
                    </span>
                  )}
                  {isActiveEditionDay && (
                    <span>
                      {m.admin_active_edition_events_today({
                        count: eventsToday,
                      })}
                    </span>
                  )}
                </button>
              )}
              {isRenewingSession && (
                // Renewal is quick but not instant; without this the dashboard just
                // sits there, which reads as a hang rather than as recovery.
                <Alert variant="info" className="mb-6 flex items-center gap-2">
                  <Spinner size="sm" aria-hidden="true" />
                  {m.admin_session_renewing()}
                </Alert>
              )}
              {globalError && (
                <Alert variant="danger" className="mb-6" onClose={() => setGlobalError("")}>
                  {globalError}
                </Alert>
              )}

              {isAnyPending && !cacheStatus.warmStart && effectiveActiveKey !== "home" ? (
                <AdminSkeleton variant={skeletonVariantForSection(effectiveActiveKey)} />
              ) : (
                <AdminSectionPane key={effectiveActiveKey} section={effectiveActiveKey}>
                  <Section />
                </AdminSectionPane>
              )}
            </div>
          </SidebarProvider>
        </AdminWorkspaceContext.Provider>
      )}
    </section>
  );
}

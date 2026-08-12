import React from "react";
import clsx from "clsx";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";

interface SidebarItemProps {
  itemKey: string;
  icon: string;
  label: string;
  count?: number;
  activeKey: string;
  setActiveKey: (key: string) => void;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

function SidebarItem({
  itemKey,
  icon,
  label,
  count = 0,
  activeKey,
  setActiveKey,
  setSidebarOpen,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      className={clsx("admin-nav-item", activeKey === itemKey && "is-active")}
      aria-current={activeKey === itemKey ? "page" : undefined}
      onClick={() => {
        setActiveKey(itemKey);
        setSidebarOpen(false);
      }}
    >
      <i className={clsx("bi", icon)} aria-hidden="true" />
      <span>{label}</span>
      {count > 0 && <span className="admin-nav-count">{count}</span>}
    </button>
  );
}

interface SidebarGroupProps {
  groupKey: string;
  icon: string;
  label: string;
  itemKeys: string[];
  children: React.ReactNode;
  activeKey: string;
  expandedGroups: Set<string>;
  toggleGroup: (group: string) => void;
}

function SidebarGroup({
  groupKey,
  icon,
  label,
  itemKeys,
  children,
  activeKey,
  expandedGroups,
  toggleGroup,
}: SidebarGroupProps) {
  return (
    <div className="admin-nav-group">
      <button
        type="button"
        className={clsx("admin-nav-group-header", itemKeys.includes(activeKey) && "has-active")}
        onClick={() => toggleGroup(groupKey)}
        aria-expanded={expandedGroups.has(groupKey)}
        aria-controls={`admin-nav-sub-${groupKey}`}
      >
        <i className={clsx("bi", icon)} aria-hidden="true" />
        <span>{label}</span>
        <i
          className={clsx(
            "bi admin-nav-chevron",
            expandedGroups.has(groupKey) ? "bi-chevron-up" : "bi-chevron-down",
          )}
          aria-hidden="true"
        />
      </button>
      {expandedGroups.has(groupKey) && (
        <div id={`admin-nav-sub-${groupKey}`} className="admin-nav-sub">
          {children}
        </div>
      )}
    </div>
  );
}

export interface AdminSidebarProps {
  activeKey: string;
  setActiveKey: (key: string) => void;
  expandedGroups: Set<string>;
  toggleGroup: (group: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  navRef: React.RefObject<HTMLElement | null>;
  handleNavKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  registrationCount: number;
  peopleCount: number;
  membersCount: number;
  volunteerCount: number;
  isAnyFetching: boolean;
  onLoadData: () => void;
  onLogout: () => void;
  accountLabel: string | null;
  isSigningOut: boolean;
  canManageAdminSections: boolean;
}

export default function AdminSidebar({
  activeKey,
  setActiveKey,
  expandedGroups,
  toggleGroup,
  sidebarOpen,
  setSidebarOpen,
  navRef,
  handleNavKeyDown,
  registrationCount,
  peopleCount,
  membersCount,
  volunteerCount,
  isAnyFetching,
  onLoadData,
  onLogout,
  accountLabel,
  isSigningOut,
  canManageAdminSections,
}: AdminSidebarProps) {
  const itemProps = { activeKey, setActiveKey, setSidebarOpen };
  const groupProps = { activeKey, expandedGroups, toggleGroup };

  return (
    <>
      {/* Sidebar */}
      <aside className={clsx("admin-sidebar", sidebarOpen && "admin-sidebar-open")}>
        {/* Brand */}
        <div className="admin-sidebar-brand">
          <i className="bi bi-shield-lock" aria-hidden="true" />
          <h2 id="admin-title">{m.admin_title()}</h2>
        </div>

        {/* Navigation */}
        <nav
          className="admin-nav"
          aria-label={m.admin_title()}
          ref={navRef}
          onKeyDown={handleNavKeyDown}
        >
          <SidebarItem
            itemKey="registrations"
            icon="bi-calendar-check"
            label={m.admin_registrations_tab()}
            count={registrationCount}
            {...itemProps}
          />

          {canManageAdminSections && (
            <>
              <SidebarGroup
                groupKey="events"
                icon="bi-calendar-event"
                label={m.admin_events_group()}
                itemKeys={["editions"]}
                {...groupProps}
              >
                <SidebarItem
                  itemKey="editions"
                  icon="bi-calendar3"
                  label={m.admin_content_editions_section()}
                  {...itemProps}
                />
              </SidebarGroup>

              <SidebarGroup
                groupKey="content"
                icon="bi-collection"
                label={m.admin_content_tab()}
                itemKeys={["exhibitors", "faq", "settings"]}
                {...groupProps}
              >
                <SidebarItem
                  itemKey="exhibitors"
                  icon="bi-shop"
                  label={m.admin_content_exhibitors_section()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="faq"
                  icon="bi-question-circle"
                  label={m.admin_content_faq_section()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="settings"
                  icon="bi-sliders"
                  label={m.admin_content_settings_section()}
                  {...itemProps}
                />
              </SidebarGroup>

              <SidebarGroup
                groupKey="venue"
                icon="bi-geo-alt"
                label={m.admin_venue_group()}
                itemKeys={["venues", "floor-plans"]}
                {...groupProps}
              >
                <SidebarItem
                  itemKey="venues"
                  icon="bi-building"
                  label={m.admin_venues_rooms_tab()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="floor-plans"
                  icon="bi-grid-3x3-gap"
                  label={m.admin_floor_plans_tab()}
                  {...itemProps}
                />
              </SidebarGroup>

              <SidebarGroup
                groupKey="people"
                icon="bi-people"
                label={m.admin_people_tab()}
                itemKeys={["directory", "members", "volunteers"]}
                {...groupProps}
              >
                <SidebarItem
                  itemKey="directory"
                  icon="bi-person"
                  label={m.admin_directory_tab()}
                  count={peopleCount}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="members"
                  icon="bi-person-badge"
                  label={m.admin_members_tab()}
                  count={membersCount}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="volunteers"
                  icon="bi-hand-thumbs-up"
                  label={m.admin_volunteers_tab()}
                  count={volunteerCount}
                  {...itemProps}
                />
              </SidebarGroup>
            </>
          )}

          {canManageAdminSections && (
            <SidebarGroup
              groupKey="insights"
              icon="bi-graph-up"
              label={m.admin_insights_group()}
              itemKeys={["analytics", "audit-log"]}
              {...groupProps}
            >
              <SidebarItem
                itemKey="analytics"
                icon="bi-bar-chart"
                label={m.admin_analytics_tab()}
                {...itemProps}
              />
              <SidebarItem
                itemKey="audit-log"
                icon="bi-journal-text"
                label={m.admin_audit_log_tab()}
                {...itemProps}
              />
            </SidebarGroup>
          )}
        </nav>

        {/* Footer: status + actions */}
        <div className="admin-sidebar-footer">
          <div className="admin-auth-status">
            <i className="bi bi-check-circle-fill" aria-hidden="true" />
            {/* Which account is signed in matters here: role decides which sections
                exist at all, so "why can't I see X" starts with "who am I?". */}
            <span className="admin-auth-account" title={accountLabel ?? undefined}>
              {accountLabel ?? m.admin_authenticated()}
            </span>
            <span className="admin-auth-role">
              {canManageAdminSections ? m.admin_role_admin() : m.admin_role_volunteer()}
            </span>
          </div>
          <div className="d-flex gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={onLoadData}
              disabled={isAnyFetching}
              title={m.admin_refresh()}
              aria-label={m.admin_refresh()}
            >
              <i
                className={clsx("bi bi-arrow-clockwise", isAnyFetching && "spin")}
                aria-hidden="true"
              />
            </Button>
            {/* Labeled, not icon-only: this sits next to Refresh and is destructive
                (it ends the session and discards loaded work), so it must not be a
                same-shaped icon its neighbor can be mistaken for. */}
            <Button
              variant="outline-danger"
              size="sm"
              className="flex-grow-1"
              onClick={onLogout}
              disabled={isSigningOut}
              title={m.admin_logout()}
            >
              {isSigningOut ? (
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  className="me-2"
                  aria-hidden="true"
                />
              ) : (
                <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
              )}
              {isSigningOut ? m.auth_signing_out() : m.admin_logout()}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile toggle */}
      <button
        className="admin-mobile-toggle"
        onClick={() => setSidebarOpen((s) => !s)}
        aria-label={m.admin_toggle_navigation()}
        aria-expanded={sidebarOpen}
        aria-controls="admin-content"
      >
        <i className={clsx("bi", sidebarOpen ? "bi-x-lg" : "bi-list")} aria-hidden="true" />
      </button>
    </>
  );
}

import React from "react";
import clsx from "clsx";
import Button from "react-bootstrap/Button";
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
      {expandedGroups.has(groupKey) && <div className="admin-nav-sub">{children}</div>}
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
            itemKeys={["exhibitors"]}
            {...groupProps}
          >
            <SidebarItem
              itemKey="exhibitors"
              icon="bi-shop"
              label={m.admin_content_exhibitors_section()}
              {...itemProps}
            />
          </SidebarGroup>

          <SidebarGroup
            groupKey="venue"
            icon="bi-geo-alt"
            label={m.admin_venue_group()}
            itemKeys={["venues", "table-types", "floor-plans"]}
            {...groupProps}
          >
            <SidebarItem itemKey="venues" icon="bi-building" label={m.admin_venues_rooms_tab()} {...itemProps} />
            <SidebarItem itemKey="table-types" icon="bi-grid" label={m.admin_table_types_tab()} {...itemProps} />
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
        </nav>

        {/* Footer: status + actions */}
        <div className="admin-sidebar-footer">
          <div className="admin-auth-status">
            <i className="bi bi-check-circle-fill" aria-hidden="true" />
            <span>{m.admin_authenticated()}</span>
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
            <Button
              variant="outline-danger"
              size="sm"
              onClick={onLogout}
              title={m.admin_logout()}
              aria-label={m.admin_logout()}
            >
              <i className="bi bi-box-arrow-right" aria-hidden="true" />
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

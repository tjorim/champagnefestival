import React from "react";
import clsx from "clsx";
import Button from "react-bootstrap/Button";
import { m } from "@/paraglide/messages";

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
  isAnyFetching,
  onLoadData,
  onLogout,
}: AdminSidebarProps) {
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
          {/* Registrations */}
          <button
            className={clsx("admin-nav-item", activeKey === "registrations" && "is-active")}
            onClick={() => {
              setActiveKey("registrations");
              setSidebarOpen(false);
            }}
          >
            <i className="bi bi-calendar-check" aria-hidden="true" />
            <span>{m.admin_registrations_tab()}</span>
            {registrationCount > 0 && (
              <span className="admin-nav-count">{registrationCount}</span>
            )}
          </button>

          {/* Programme group */}
          <div className="admin-nav-group">
            <button
              className={clsx(
                "admin-nav-group-header",
                ["content", "floor-plans"].includes(activeKey) && "has-active",
              )}
              onClick={() => toggleGroup("programme")}
              aria-expanded={expandedGroups.has("programme")}
            >
              <i className="bi bi-collection" aria-hidden="true" />
              <span>{m.admin_programme_group()}</span>
              <i
                className={clsx(
                  "bi admin-nav-chevron",
                  expandedGroups.has("programme") ? "bi-chevron-up" : "bi-chevron-down",
                )}
                aria-hidden="true"
              />
            </button>
            {expandedGroups.has("programme") && (
              <div className="admin-nav-sub">
                <button
                  className={clsx("admin-nav-item", activeKey === "content" && "is-active")}
                  onClick={() => {
                    setActiveKey("content");
                    setSidebarOpen(false);
                  }}
                >
                  <i className="bi bi-images" aria-hidden="true" />
                  <span>{m.admin_content_tab()}</span>
                </button>
                <button
                  className={clsx("admin-nav-item", activeKey === "floor-plans" && "is-active")}
                  onClick={() => {
                    setActiveKey("floor-plans");
                    setSidebarOpen(false);
                  }}
                >
                  <i className="bi bi-grid-3x3-gap" aria-hidden="true" />
                  <span>{m.admin_tables_tab()}</span>
                </button>
              </div>
            )}
          </div>

          {/* Venue */}
          <button
            className={clsx("admin-nav-item", activeKey === "venue" && "is-active")}
            onClick={() => {
              setActiveKey("venue");
              setSidebarOpen(false);
            }}
          >
            <i className="bi bi-geo-alt" aria-hidden="true" />
            <span>{m.admin_venues_tab()}</span>
          </button>

          {/* People group */}
          <button
            className={clsx("admin-nav-item", activeKey === "people" && "is-active")}
            onClick={() => {
              setActiveKey("people");
              setSidebarOpen(false);
            }}
          >
            <i className="bi bi-people" aria-hidden="true" />
            <span>{m.admin_people_tab()}</span>
            {peopleCount > 0 && <span className="admin-nav-count">{peopleCount}</span>}
          </button>
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

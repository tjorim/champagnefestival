import {
  BuildingIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ChartColumnIcon,
  ChartNoAxesCombinedIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  ContactRoundIcon,
  Grid3X3Icon,
  HourglassIcon,
  LayersIcon,
  LogOutIcon,
  MailIcon,
  MapPinIcon,
  MegaphoneIcon,
  MenuIcon,
  NotebookTextIcon,
  RotateCwIcon,
  SendIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  StoreIcon,
  ThumbsUpIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";

interface SidebarItemProps {
  itemKey: string;
  icon: LucideIcon;
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
      className={cn("admin-nav-item", activeKey === itemKey && "is-active")}
      aria-current={activeKey === itemKey ? "page" : undefined}
      onClick={() => {
        setActiveKey(itemKey);
        setSidebarOpen(false);
      }}
    >
      <Icon icon={icon} />
      <span>{label}</span>
      {count > 0 && <span className="admin-nav-count">{count}</span>}
    </button>
  );
}

interface SidebarGroupProps {
  groupKey: string;
  icon: LucideIcon;
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
        className={cn("admin-nav-group-header", itemKeys.includes(activeKey) && "has-active")}
        onClick={() => toggleGroup(groupKey)}
        aria-expanded={expandedGroups.has(groupKey)}
        aria-controls={`admin-nav-sub-${groupKey}`}
      >
        <Icon icon={icon} />
        <span>{label}</span>
        <Icon
          icon={expandedGroups.has(groupKey) ? ChevronUpIcon : ChevronDownIcon}
          className="admin-nav-chevron"
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
      <aside className={cn("admin-sidebar", sidebarOpen && "admin-sidebar-open")}>
        {/* Brand */}
        <div className="admin-sidebar-brand">
          <Icon icon={ShieldIcon} />
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
            icon={CalendarCheckIcon}
            label={m.admin_registrations_tab()}
            count={registrationCount}
            {...itemProps}
          />

          {canManageAdminSections && (
            <>
              <SidebarItem
                itemKey="waitlist"
                icon={HourglassIcon}
                label={m.admin_waitlist_section()}
                {...itemProps}
              />

              <SidebarItem
                itemKey="scratchpad"
                icon={NotebookTextIcon}
                label={m.admin_scratchpad_section()}
                {...itemProps}
              />
              <SidebarGroup
                groupKey="events"
                icon={CalendarDaysIcon}
                label={m.admin_events_group()}
                itemKeys={["editions"]}
                {...groupProps}
              >
                <SidebarItem
                  itemKey="editions"
                  icon={CalendarIcon}
                  label={m.admin_content_editions_section()}
                  {...itemProps}
                />
              </SidebarGroup>

              <SidebarGroup
                groupKey="content"
                icon={LayersIcon}
                label={m.admin_content_tab()}
                itemKeys={[
                  "organizations",
                  "faq",
                  "announcements",
                  "composer",
                  "policies",
                  "contact-messages",
                  "settings",
                ]}
                {...groupProps}
              >
                <SidebarItem
                  itemKey="organizations"
                  icon={StoreIcon}
                  label={m.admin_content_organizations_section()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="faq"
                  icon={CircleHelpIcon}
                  label={m.admin_content_faq_section()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="announcements"
                  icon={MegaphoneIcon}
                  label={m.admin_announcements_section()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="composer"
                  icon={SendIcon}
                  label={m.admin_composer_section()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="policies"
                  icon={ShieldIcon}
                  label={m.admin_policies_section()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="contact-messages"
                  icon={MailIcon}
                  label={m.admin_contact_messages_section()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="settings"
                  icon={SlidersHorizontalIcon}
                  label={m.admin_content_settings_section()}
                  {...itemProps}
                />
              </SidebarGroup>

              <SidebarGroup
                groupKey="venue"
                icon={MapPinIcon}
                label={m.admin_venue_group()}
                itemKeys={["venues", "floor-plans"]}
                {...groupProps}
              >
                <SidebarItem
                  itemKey="venues"
                  icon={BuildingIcon}
                  label={m.admin_venues_rooms_tab()}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="floor-plans"
                  icon={Grid3X3Icon}
                  label={m.admin_floor_plans_tab()}
                  {...itemProps}
                />
              </SidebarGroup>

              <SidebarGroup
                groupKey="people"
                icon={UsersIcon}
                label={m.admin_people_tab()}
                itemKeys={["directory", "members", "volunteers"]}
                {...groupProps}
              >
                <SidebarItem
                  itemKey="directory"
                  icon={UserIcon}
                  label={m.admin_directory_tab()}
                  count={peopleCount}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="members"
                  icon={ContactRoundIcon}
                  label={m.admin_members_tab()}
                  count={membersCount}
                  {...itemProps}
                />
                <SidebarItem
                  itemKey="volunteers"
                  icon={ThumbsUpIcon}
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
              icon={ChartNoAxesCombinedIcon}
              label={m.admin_insights_group()}
              itemKeys={["analytics", "audit-log"]}
              {...groupProps}
            >
              <SidebarItem
                itemKey="analytics"
                icon={ChartColumnIcon}
                label={m.admin_analytics_tab()}
                {...itemProps}
              />
              <SidebarItem
                itemKey="audit-log"
                icon={NotebookTextIcon}
                label={m.admin_audit_log_tab()}
                {...itemProps}
              />
            </SidebarGroup>
          )}
        </nav>

        {/* Footer: status + actions */}
        <div className="admin-sidebar-footer">
          <div className="admin-auth-status">
            <Icon icon={CircleCheckIcon} />
            {/* Which account is signed in matters here: role decides which sections
                exist at all, so "why can't I see X" starts with "who am I?". */}
            <span className="admin-auth-account" title={accountLabel ?? undefined}>
              {accountLabel ?? m.admin_authenticated()}
            </span>
            <span className="admin-auth-role">
              {canManageAdminSections ? m.admin_role_admin() : m.admin_role_volunteer()}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onLoadData}
              disabled={isAnyFetching}
              title={m.admin_refresh()}
              aria-label={m.admin_refresh()}
            >
              <Icon icon={RotateCwIcon} className={cn(isAnyFetching && "animate-spin")} />
            </Button>
            {/* Labeled, not icon-only: this sits next to Refresh and is destructive
                (it ends the session and discards loaded work), so it must not be a
                same-shaped icon its neighbor can be mistaken for. */}
            <Button
              variant="outline-danger"
              size="sm"
              className="grow"
              onClick={onLogout}
              disabled={isSigningOut}
              title={m.admin_logout()}
            >
              {isSigningOut ? (
                <Spinner
                  size="sm"

                  aria-hidden="true"
                />
              ) : (
                <Icon icon={LogOutIcon} />
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
        <Icon icon={sidebarOpen ? XIcon : MenuIcon} />
      </button>
    </>
  );
}

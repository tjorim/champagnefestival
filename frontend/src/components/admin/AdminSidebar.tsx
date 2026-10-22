import {
  BuildingIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ChartColumnIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CircleQuestionMarkIcon,
  Grid3x3Icon,
  HourglassIcon,
  LayersIcon,
  LogOutIcon,
  MailIcon,
  MapPinIcon,
  MegaphoneIcon,
  NotebookTextIcon,
  PackageIcon,
  PhoneIcon,
  RotateCcwClockIcon,
  RotateCwIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  StoreIcon,
  TagsIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import React from "react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";

interface SidebarItemProps {
  itemKey: string;
  icon: LucideIcon;
  label: string;
  count?: number;
  activeKey: string;
  setActiveKey: (key: string) => void;
}

function SidebarItem({
  itemKey,
  icon,
  label,
  count = 0,
  activeKey,
  setActiveKey,
}: SidebarItemProps) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={activeKey === itemKey}
        aria-current={activeKey === itemKey ? "page" : undefined}
        onClick={() => {
          setActiveKey(itemKey);
          setOpenMobile(false);
        }}
      >
        <Icon icon={icon} />
        <span>{label}</span>
        {count > 0 && (
          <span className="ml-auto rounded bg-muted px-1.5 text-xs tabular-nums">{count}</span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
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
    <SidebarMenuItem>
      <Collapsible open={expandedGroups.has(groupKey)} onOpenChange={() => toggleGroup(groupKey)}>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              className="text-xs font-semibold"
              isActive={itemKeys.includes(activeKey)}
            />
          }
        >
          <Icon icon={icon} />
          <span>{label}</span>
          <Icon
            icon={expandedGroups.has(groupKey) ? ChevronUpIcon : ChevronDownIcon}
            className="ml-auto"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>{children}</SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

export interface AdminSidebarProps {
  activeKey: string;
  setActiveKey: (key: string) => void;
  expandedGroups: Set<string>;
  toggleGroup: (group: string) => void;
  navRef: React.RefObject<HTMLElement | null>;
  handleNavKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  registrationCount: number;
  peopleCount: number;
  isAnyFetching: boolean;
  onLoadData: () => void;
  onLogout: () => void;
  accountLabel: string | null;
  isSigningOut: boolean;
  canManageAdminSections: boolean;
  /** Formatted time of the last successful data sync, shown beside the refresh button. */
  lastSynced?: string | null;
}

export default function AdminSidebar({
  activeKey,
  setActiveKey,
  expandedGroups,
  toggleGroup,
  navRef,
  handleNavKeyDown,
  registrationCount,
  peopleCount,
  isAnyFetching,
  onLoadData,
  onLogout,
  accountLabel,
  isSigningOut,
  canManageAdminSections,
  lastSynced = null,
}: AdminSidebarProps) {
  const itemProps = { activeKey, setActiveKey };
  const groupProps = { activeKey, expandedGroups, toggleGroup };

  return (
    <>
      {/* Sidebar */}
      <Sidebar>
        {/* Brand */}
        <SidebarHeader className="flex-row items-center gap-2 border-b border-border p-4 pr-12">
          <Icon icon={ShieldIcon} />
          <span className="text-sm font-semibold">{m.admin_title()}</span>
        </SidebarHeader>

        {/* Navigation */}
        <SidebarContent className="p-2">
          <nav aria-label={m.admin_title()} ref={navRef} onKeyDown={handleNavKeyDown}>
            <SidebarMenu>
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
                    itemKey="contact-messages"
                    icon={MailIcon}
                    label={m.admin_contact_messages_section()}
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
                    itemKeys={[
                      "editions",
                      "organizations",
                      "event-categories",
                      "product-categories",
                    ]}
                    {...groupProps}
                  >
                    <SidebarItem
                      itemKey="editions"
                      icon={CalendarIcon}
                      label={m.admin_content_editions_section()}
                      {...itemProps}
                    />
                    <SidebarItem
                      itemKey="organizations"
                      icon={StoreIcon}
                      label={m.admin_content_organizations_section()}
                      {...itemProps}
                    />
                    <SidebarItem
                      itemKey="event-categories"
                      icon={TagsIcon}
                      label={m.admin_event_categories_section()}
                      {...itemProps}
                    />
                    <SidebarItem
                      itemKey="product-categories"
                      icon={PackageIcon}
                      label={m.admin_product_categories_section()}
                      {...itemProps}
                    />
                  </SidebarGroup>

                  <SidebarGroup
                    groupKey="content"
                    icon={LayersIcon}
                    label={m.admin_content_tab()}
                    itemKeys={[
                      "faq",
                      "announcements",
                      "signage-channels",
                      "policies",
                      "contact-details",
                    ]}
                    {...groupProps}
                  >
                    <SidebarItem
                      itemKey="faq"
                      icon={CircleQuestionMarkIcon}
                      label={m.admin_content_faq_section()}
                      {...itemProps}
                    />
                    <SidebarItem
                      itemKey="signage-channels"
                      icon={LayersIcon}
                      label={m.signage_channels_heading()}
                      {...itemProps}
                    />
                    <SidebarItem
                      itemKey="announcements"
                      icon={MegaphoneIcon}
                      label={m.admin_announcements_section()}
                      {...itemProps}
                    />
                    <SidebarItem
                      itemKey="policies"
                      icon={ShieldIcon}
                      label={m.admin_policies_section()}
                      {...itemProps}
                    />
                    <SidebarItem
                      itemKey="contact-details"
                      icon={PhoneIcon}
                      label={m.admin_contact_details_section()}
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
                      icon={Grid3x3Icon}
                      label={m.admin_floor_plans_tab()}
                      {...itemProps}
                    />
                  </SidebarGroup>

                  <SidebarItem
                    itemKey="people"
                    icon={UsersIcon}
                    label={m.admin_people_tab()}
                    count={peopleCount}
                    {...itemProps}
                  />
                </>
              )}

              {canManageAdminSections && (
                <>
                  <SidebarItem
                    itemKey="analytics"
                    icon={ChartColumnIcon}
                    label={m.admin_analytics_tab()}
                    {...itemProps}
                  />

                  <SidebarGroup
                    groupKey="system"
                    icon={WrenchIcon}
                    label={m.admin_system_group()}
                    itemKeys={["settings", "audit-log"]}
                    {...groupProps}
                  >
                    <SidebarItem
                      itemKey="settings"
                      icon={SlidersHorizontalIcon}
                      label={m.admin_content_settings_section()}
                      {...itemProps}
                    />
                    <SidebarItem
                      itemKey="audit-log"
                      icon={RotateCcwClockIcon}
                      label={m.admin_audit_log_tab()}
                      {...itemProps}
                    />
                  </SidebarGroup>
                </>
              )}
            </SidebarMenu>
          </nav>
        </SidebarContent>

        {/* Footer: status + actions */}
        <SidebarFooter className="border-t border-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon icon={CircleCheckIcon} />
            {/* Which account is signed in matters here: role decides which sections
                exist at all, so "why can't I see X" starts with "who am I?". */}
            <span className="min-w-0 truncate" title={accountLabel ?? undefined}>
              {accountLabel ?? m.admin_authenticated()}
            </span>
            <span className="ml-auto shrink-0 rounded border border-border px-1.5 text-xs">
              {canManageAdminSections ? m.admin_role_admin() : m.admin_role_volunteer()}
            </span>
          </div>
          {lastSynced && (
            <p className="m-0 text-xs text-muted-foreground" role="status">
              {m.admin_cache_last_synced({ time: lastSynced })}
            </p>
          )}
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
        </SidebarFooter>
      </Sidebar>

      <SidebarTrigger
        className="fixed bottom-5 right-5 z-10 size-11 rounded-full border border-border bg-sidebar shadow-lg site-lg:hidden"
        aria-label={m.admin_toggle_navigation()}
      />
    </>
  );
}

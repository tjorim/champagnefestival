import { fireEvent, render as renderBase, screen, within } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { ReactElement } from "react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import AdminSidebar from "@/components/admin/AdminSidebar";

vi.mock("@/paraglide/messages", () => ({
  m: {
    admin_title: () => "Administration",
    admin_registrations_tab: () => "Registrations",
    admin_waitlist_section: () => "Waitlist",
    admin_scratchpad_section: () => "Scratchpad",
    admin_events_group: () => "Events",
    admin_content_editions_section: () => "Editions",
    admin_event_categories_section: () => "Event categories",
    admin_product_categories_section: () => "Product categories",
    admin_content_tab: () => "Content",
    admin_content_organizations_section: () => "Organisations",
    admin_content_faq_section: () => "FAQ",
    signage_channels_heading: () => "Screen channels",
    admin_announcements_section: () => "Announcements",
    admin_policies_section: () => "Legal Policies",
    admin_contact_messages_section: () => "Contact messages",
    admin_content_settings_section: () => "Settings",
    admin_venue_group: () => "Venue",
    admin_venues_rooms_tab: () => "Venues & Rooms",
    admin_floor_plans_tab: () => "Floor Plans",
    admin_people_tab: () => "People",
    admin_system_group: () => "System",
    admin_contact_details_section: () => "Contact details",
    admin_cache_last_synced: ({ time }: { time: string }) => `Last synced: ${time}`,
    admin_analytics_tab: () => "Analytics",
    admin_audit_log_tab: () => "Audit Log",
    admin_authenticated: () => "Authenticated",
    admin_refresh: () => "Refresh",
    admin_logout: () => "Log out",
    admin_toggle_navigation: () => "Toggle navigation",
    admin_role_admin: () => "Admin",
    admin_role_volunteer: () => "Volunteer",
    auth_signing_out: () => "Signing out…",
  },
}));

function render(ui: ReactElement) {
  return renderBase(<SidebarProvider>{ui}</SidebarProvider>);
}

const expandedGroups = new Set(["events", "content", "venue"]);

function renderSidebar(setActiveKey = vi.fn(), canManageAdminSections = true) {
  render(
    <AdminSidebar
      activeKey="registrations"
      setActiveKey={setActiveKey}
      expandedGroups={expandedGroups}
      toggleGroup={vi.fn()}
      navRef={createRef<HTMLElement>()}
      handleNavKeyDown={vi.fn()}
      registrationCount={2}
      peopleCount={3}
      isAnyFetching={false}
      onLoadData={vi.fn()}
      onLogout={vi.fn()}
      accountLabel="ada@example.org"
      isSigningOut={false}
      canManageAdminSections={canManageAdminSections}
    />,
  );
}

describe("AdminSidebar", () => {
  it("shows every admin destination in its expanded sidebar group", () => {
    renderSidebar();

    const navigation = screen.getByRole("navigation", { name: "Administration" });
    expect(
      within(navigation)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Registrations2",
      "Waitlist",
      "Contact messages",
      "Scratchpad",
      "Events",
      "Editions",
      "Organisations",
      "Event categories",
      "Product categories",
      "Content",
      "FAQ",
      "Screen channels",
      "Announcements",
      "Legal Policies",
      "Contact details",
      "Venue",
      "Venues & Rooms",
      "Floor Plans",
      "People3",
      "Analytics",
      "System",
    ]);
  });

  it("lists settings and the audit log together under System", () => {
    render(
      <AdminSidebar
        activeKey="registrations"
        setActiveKey={vi.fn()}
        expandedGroups={new Set(["system"])}
        toggleGroup={vi.fn()}
        navRef={createRef<HTMLElement>()}
        handleNavKeyDown={vi.fn()}
        registrationCount={0}
        peopleCount={0}
        isAnyFetching={false}
        onLoadData={vi.fn()}
        onLogout={vi.fn()}
        accountLabel={null}
        isSigningOut={false}
        canManageAdminSections
        lastSynced="12:00"
      />,
    );

    const system = screen.getByRole("button", { name: "System" });
    expect(system).toHaveAttribute("aria-expanded", "true");
    const submenu = document.getElementById(system.getAttribute("aria-controls") ?? "");
    expect(
      within(submenu as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Settings", "Audit Log"]);
    expect(screen.getByRole("status")).toHaveTextContent("Last synced: 12:00");
  });

  it("shows only registrations to non-admin roles", () => {
    renderSidebar(vi.fn(), false);

    const navigation = screen.getByRole("navigation", { name: "Administration" });
    expect(
      within(navigation)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Registrations2"]);
  });

  it("selects a leaf destination directly from the sidebar", () => {
    const setActiveKey = vi.fn();
    renderSidebar(setActiveKey);

    fireEvent.click(screen.getByRole("button", { name: "Floor Plans" }));

    expect(setActiveKey).toHaveBeenCalledWith("floor-plans");
  });
});

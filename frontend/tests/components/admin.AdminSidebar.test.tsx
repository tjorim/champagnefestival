import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import AdminSidebar from "@/components/admin/AdminSidebar";

vi.mock("@/paraglide/messages", () => ({
  m: {
    admin_title: () => "Administration",
    admin_registrations_tab: () => "Registrations",
    admin_events_group: () => "Events",
    admin_content_editions_section: () => "Editions",
    admin_content_tab: () => "Content",
    admin_content_exhibitors_section: () => "Exhibitors",
    admin_venue_group: () => "Venue",
    admin_venues_rooms_tab: () => "Venues & Rooms",
    admin_table_types_tab: () => "Table Types",
    admin_floor_plans_tab: () => "Floor Plans",
    admin_people_tab: () => "People",
    admin_directory_tab: () => "Directory",
    admin_members_tab: () => "Members",
    admin_volunteers_tab: () => "Volunteers",
    admin_insights_group: () => "Insights",
    admin_analytics_tab: () => "Analytics",
    admin_audit_log_tab: () => "Audit Log",
    admin_authenticated: () => "Authenticated",
    admin_refresh: () => "Refresh",
    admin_logout: () => "Log out",
    admin_toggle_navigation: () => "Toggle navigation",
  },
}));

const expandedGroups = new Set(["events", "content", "venue", "people"]);

function renderSidebar(setActiveKey = vi.fn(), canManageAdminSections = true) {
  render(
    <AdminSidebar
      activeKey="registrations"
      setActiveKey={setActiveKey}
      expandedGroups={expandedGroups}
      toggleGroup={vi.fn()}
      sidebarOpen={false}
      setSidebarOpen={vi.fn()}
      navRef={createRef<HTMLElement>()}
      handleNavKeyDown={vi.fn()}
      registrationCount={2}
      peopleCount={3}
      membersCount={4}
      volunteerCount={5}
      isAnyFetching={false}
      onLoadData={vi.fn()}
      onLogout={vi.fn()}
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
      "Events",
      "Editions",
      "Content",
      "Exhibitors",
      "Venue",
      "Venues & Rooms",
      "Table Types",
      "Floor Plans",
      "People",
      "Directory3",
      "Members4",
      "Volunteers5",
      "Insights",
    ]);
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

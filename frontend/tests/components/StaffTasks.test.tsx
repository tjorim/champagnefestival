import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StaffTasks from "@/components/StaffTasks";
import { useAuth } from "@/contexts/AuthContext";
import { m } from "@/paraglide/messages";
import { renderLocation } from "../utils/locationRouter";

const baseAuth = vi.mocked(useAuth)();
beforeEach(() => vi.mocked(useAuth).mockReturnValue(baseAuth));

for (const roles of [
  ["admin"],
  ["volunteer"],
  ["member"],
  ["organization-contact"],
  ["admin", "volunteer", "member"],
]) {
  describe(roles.join(" + "), () => {
    it("exposes only the permitted tasks", async () => {
      vi.mocked(useAuth).mockReturnValue({
        ...baseAuth,
        isAuthenticated: true,
        hasRole: (role) => roles.includes(role),
      });
      await renderLocation(
        <StaffTasks expanded editionId="edition-test" editionLabel="Festival 2026 · 28/10/2026" />,
      );
      const staff = roles.includes("admin") || roles.includes("volunteer");
      expect(screen.queryByRole("navigation", { name: m.workspace_title() }) !== null).toBe(staff);
      if (!staff) return;
      expect(screen.getByRole("link", { name: m.workspace_scan() })).toHaveAttribute(
        "href",
        "/check-in?edition=edition-test",
      );
      expect(screen.getByRole("link", { name: m.workspace_seating() })).toHaveAttribute(
        "href",
        "/venue-plan?edition=edition-test",
      );
      expect(screen.queryByRole("link", { name: m.workspace_volunteer() }) !== null).toBe(
        roles.includes("volunteer"),
      );
      expect(screen.queryByRole("link", { name: m.admin_people_tab() }) !== null).toBe(
        roles.includes("admin"),
      );
      expect(screen.getByText("Festival 2026 · 28/10/2026")).toBeVisible();
    });
  });
}

it("preserves existing admin list state between sections", async () => {
  await renderLocation(
    <StaffTasks expanded />,
    "/admin?registrations=%7B%22search%22%3A%22Alice%22%7D",
  );
  expect(
    screen.getByRole("link", { name: m.workspace_find_booking() }).getAttribute("href"),
  ).toContain("registrations=");
});

it("offers the seating edition chooser when no edition is known", async () => {
  await renderLocation(<StaffTasks expanded />);
  expect(screen.getByRole("link", { name: m.workspace_seating() })).toHaveAttribute(
    "href",
    "/venue-plan",
  );
});

it("links a genuine zero count to the exact global pending queue", async () => {
  await renderLocation(
    <StaffTasks
      expanded
      pendingBookings={{ count: 0, loading: false, error: false, retry: vi.fn() }}
    />,
  );
  expect(
    screen.getByRole("link", { name: m.workspace_pending_bookings({ count: 0 }) }),
  ).toHaveAttribute(
    "href",
    "/admin?section=registrations&registrationStatus=pending&workQueue=pending",
  );
});

for (const state of ["loading", "error"]) {
  it(`never presents ${state} as zero pending bookings`, async () => {
    await renderLocation(
      <StaffTasks
        expanded
        pendingBookings={{
          count: 0,
          loading: state === "loading",
          error: state === "error",
          retry: vi.fn(),
        }}
      />,
    );
    expect(
      screen.queryByRole("link", { name: m.workspace_pending_bookings({ count: 0 }) }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole(state === "loading" ? "status" : "alert")).toBeVisible();
  });
}

it("carries edition context between standalone tools without copying credentials", async () => {
  await renderLocation(<StaffTasks />, "/me?edition=chosen&token=private-email-credential");
  expect(screen.getByRole("link", { name: m.workspace_scan() })).toHaveAttribute(
    "href",
    "/check-in?edition=chosen",
  );
  expect(screen.getByRole("link", { name: m.workspace_seating() })).toHaveAttribute(
    "href",
    "/venue-plan?edition=chosen",
  );
  for (const link of screen.getAllByRole("link"))
    expect(link.getAttribute("href")).not.toContain("private-email-credential");
});

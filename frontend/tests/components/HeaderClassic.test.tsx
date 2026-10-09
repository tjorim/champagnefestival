import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import HeaderClassic from "@/components/HeaderClassic";

vi.mock("@/paraglide/messages", () => ({
  m: {
    close: () => "Close",
    festival_name: () => "Champagnefestival",
    admin_toggle_navigation: () => "Toggle navigation",
    language_select: () => "Select language",
    header_logo_alt: () => "Champagnefestival logo",
    admin_title: () => "Administration",
    nav_schedule: () => "Schedule",
    nav_other_events: () => "Other events",
    nav_faq: () => "FAQ",
    nav_location: () => "Location",
    nav_contact: () => "Contact",
  },
}));

vi.mock("@/paraglide/runtime", () => ({
  getLocale: vi.fn().mockReturnValue("nl"),
  setLocale: vi.fn(),
  isLocale: vi.fn().mockReturnValue(true),
}));

vi.mock("@/components/LanguageSwitcher", () => ({
  default: () => <div data-testid="language-switcher" />,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: { to: string } & import("react").ComponentProps<"a">) => (
    <a href={to} {...props} />
  ),
}));

const otherEventsState = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock("@/hooks/useOtherEvents", () => ({
  useOtherEventItems: () => ({ items: otherEventsState.items, isLoading: false, isError: false }),
}));

describe("HeaderClassic component", () => {
  it("renders the festival name", () => {
    render(<HeaderClassic />);
    expect(screen.getByText("Champagnefestival")).toBeInTheDocument();
  });

  it("renders the wordmark, with the full festival name for assistive tech", () => {
    render(<HeaderClassic />);
    const brand = screen.getByText("Champagnefestival").closest("a");
    expect(brand).toHaveTextContent(/Champagne\s*festival/);
    expect(brand?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it("only links to other events once there are upcoming ones", () => {
    otherEventsState.items = [];
    const { unmount } = render(<HeaderClassic />);
    expect(screen.queryByRole("link", { name: "Other events" })).not.toBeInTheDocument();
    unmount();

    otherEventsState.items = [{ id: "event-1" }];
    render(<HeaderClassic />);
    expect(screen.getAllByRole("link", { name: "Other events" }).length).toBeGreaterThan(0);
    otherEventsState.items = [];
  });

  it("renders the language switcher", () => {
    render(<HeaderClassic />);
    expect(screen.getByTestId("language-switcher")).toBeInTheDocument();
  });

  it("logo links to #welcome", () => {
    render(<HeaderClassic />);
    const brand = screen.getByText("Champagnefestival").closest("a");
    expect(brand).toHaveAttribute("href", "#welcome");
  });

  it("links to the administration page", () => {
    render(<HeaderClassic />);
    const adminLink = screen.getByRole("link", { name: "Administration" });
    expect(adminLink).toHaveAttribute("href", "/admin");
    expect(adminLink.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("offers a mobile menu with the admin entry", async () => {
    const user = userEvent.setup();
    render(<HeaderClassic />);
    await user.click(screen.getByRole("button", { name: "Toggle navigation" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });
});

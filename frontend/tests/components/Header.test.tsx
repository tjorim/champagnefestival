import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import Header from "@/components/Header";

vi.mock("@/paraglide/messages", () => ({
  m: {
    close: () => "Close",
    festival_name: () => "Champagnefestival",
    language_select: () => "Select language",
    header_logo_alt: () => "Champagnefestival logo",
    admin_title: () => "Administration",
    admin_toggle_navigation: () => "Toggle navigation",
    nav_schedule: () => "Schedule",
    nav_other_events: () => "Other events",
    nav_faq: () => "FAQ",
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

describe("Header component", () => {
  it("opens an accessible mobile dialog, closes with Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const trigger = screen.getByRole("button", { name: "Toggle navigation" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect((await axe(dialog)).violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders the festival name", () => {
    render(<Header />);
    expect(screen.getByText("Champagnefestival")).toBeInTheDocument();
  });

  it("renders the logo image", () => {
    render(<Header />);
    const logo = screen.getByAltText("Champagnefestival logo");
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/images/logo.svg");
  });

  it("accepts a custom logoSrc prop", () => {
    render(<Header logoSrc="/images/custom-logo.png" />);
    expect(screen.getByAltText("Champagnefestival logo")).toHaveAttribute(
      "src",
      "/images/custom-logo.png",
    );
  });

  it("renders the language switcher", () => {
    render(<Header />);
    expect(screen.getByTestId("language-switcher")).toBeInTheDocument();
  });

  it("logo links to #welcome", () => {
    render(<Header />);
    const brand = screen.getByText("Champagnefestival").closest("a");
    expect(brand).toHaveAttribute("href", "#welcome");
  });

  it("links to the administration page", () => {
    render(<Header />);
    const adminLinks = screen.getAllByRole("link", { name: "Administration" });
    expect(adminLinks.length).toBeGreaterThan(0);
    adminLinks.forEach((adminLink) => {
      expect(adminLink).toHaveAttribute("href", "/admin");
      expect(adminLink.querySelector("svg")).toBeInTheDocument();
    });
  });
});

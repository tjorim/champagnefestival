import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Header from "@/components/Header";

vi.mock("@/paraglide/messages", () => ({
  m: {
    festival_name: () => "Champagnefestival",
    language_select: () => "Select language",
    header_logo_alt: () => "Champagnefestival logo",
    admin_title: () => "Administration",
    nav_schedule: () => "Schedule",
    nav_community_events: () => "Community events",
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
    const adminLink = screen.getByRole("link", { name: "Administration" });
    expect(adminLink).toHaveAttribute("href", "/admin");
    expect(adminLink.querySelector(".bi-shield-lock")).toBeInTheDocument();
  });
});

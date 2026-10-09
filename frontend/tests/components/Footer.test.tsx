import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Footer from "@/components/Footer";

vi.mock("@/paraglide/messages", () => ({
  m: {
    festival_name: () => "Champagnefestival",
    footer_rights: () => "All rights reserved.",
    footer_privacy: () => "Privacy Policy",
    footer_navigation_label: () => "Footer navigation",
    nav_schedule: () => "Schedule",
    nav_other_events: () => "Other events",
    nav_faq: () => "FAQ",
    nav_location: () => "Location",
    nav_contact: () => "Contact",
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: { to: string } & import("react").ComponentProps<"a">) => (
    <a href={to} {...props} />
  ),
}));

vi.mock("@/hooks/useOtherEvents", () => ({
  useOtherEventItems: () => ({ items: [{ id: "event-1" }], isLoading: false, isError: false }),
}));

describe("Footer component", () => {
  it("renders footer with copyright text", () => {
    render(<Footer />);

    // Check that the copyright text includes the current year
    const currentYear = new Date().getFullYear().toString();
    const footer = screen.getByRole("contentinfo");

    expect(footer).toHaveTextContent(`© ${currentYear} Champagnefestival. All rights reserved.`);
  });

  it("renders a link to the privacy policy page", () => {
    render(<Footer />);

    const privacyLink = screen.getByRole("link", { name: "Privacy Policy" });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute("href", "/privacy");
  });

  it("repeats the site navigation as in-page links", () => {
    render(<Footer />);

    const nav = screen.getByRole("navigation", { name: "Footer navigation" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#schedule",
      "#other-events",
      "#faq",
      "#map",
      "#contact",
    ]);
  });
});

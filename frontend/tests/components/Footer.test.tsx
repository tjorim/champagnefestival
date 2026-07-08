import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Footer from "@/components/Footer";

vi.mock("@/paraglide/messages", () => ({
  m: {
    festival_name: () => "Champagnefestival",
    footer_rights: () => "All rights reserved.",
    footer_privacy: () => "Privacy Policy",
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: { to: string } & import("react").ComponentProps<"a">) => (
    <a href={to} {...props} />
  ),
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
});

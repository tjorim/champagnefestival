import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PrivacyPolicyPage from "@/components/PrivacyPolicyPage";

vi.mock("@/paraglide/messages", () => ({
  m: {
    privacy_title: () => "Privacy Policy Title",
  },
}));

vi.mock("@/config/privacyPolicy", () => ({
  privacyPolicyConfig: {
    getLastUpdated: () => "Last updated",
    getLastUpdatedDate: () => "2024-01-01",
    getIntro: () => "This is the privacy introduction.",
    sections: [
      { getTitle: () => "Data Collection", getContent: () => "We collect minimal data." },
      { getTitle: () => "Your Rights", getContent: () => "You have the right to access." },
    ],
  },
}));

vi.mock("@/config/contact", () => ({
  contactConfig: {
    emails: { contact: "privacy@example.com" },
  },
}));

describe("PrivacyPolicyPage component", () => {
  it("renders the title and intro", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText("Privacy Policy Title")).toBeInTheDocument();
    expect(screen.getByText("This is the privacy introduction.")).toBeInTheDocument();
  });

  it("renders all sections", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText("Data Collection")).toBeInTheDocument();
    expect(screen.getByText("We collect minimal data.")).toBeInTheDocument();
    expect(screen.getByText("Your Rights")).toBeInTheDocument();
    expect(screen.getByText("You have the right to access.")).toBeInTheDocument();
  });

  it("shows the last updated date", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    expect(screen.getByText(/2024-01-01/)).toBeInTheDocument();
  });

  it("renders a mailto contact link", () => {
    render(<PrivacyPolicyPage />);
    const link = screen.getByRole("link", { name: "privacy@example.com" });
    expect(link).toHaveAttribute("href", "mailto:privacy@example.com");
  });
});

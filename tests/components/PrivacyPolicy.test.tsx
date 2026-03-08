import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PrivacyPolicy from "@/components/PrivacyPolicy";

vi.mock("@/paraglide/messages", () => ({
  m: {
    footer_privacy: () => "Privacy Policy",
    privacy_title: () => "Privacy Policy Title",
    close: () => "Close",
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

describe("PrivacyPolicy component", () => {
  it("renders a trigger button", () => {
    render(<PrivacyPolicy />);
    expect(screen.getByRole("button", { name: "Privacy Policy" })).toBeInTheDocument();
  });

  it("modal is hidden initially", () => {
    render(<PrivacyPolicy />);
    expect(screen.queryByText("Privacy Policy Title")).not.toBeInTheDocument();
  });

  it("opens modal when trigger button is clicked", () => {
    render(<PrivacyPolicy />);
    fireEvent.click(screen.getByRole("button", { name: "Privacy Policy" }));
    expect(screen.getByText("Privacy Policy Title")).toBeInTheDocument();
  });

  it("shows intro and sections in modal", () => {
    render(<PrivacyPolicy />);
    fireEvent.click(screen.getByRole("button", { name: "Privacy Policy" }));
    expect(screen.getByText("This is the privacy introduction.")).toBeInTheDocument();
    expect(screen.getByText("Data Collection")).toBeInTheDocument();
    expect(screen.getByText("We collect minimal data.")).toBeInTheDocument();
  });

  it("shows last updated date", () => {
    render(<PrivacyPolicy />);
    fireEvent.click(screen.getByRole("button", { name: "Privacy Policy" }));
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    expect(screen.getByText(/2024-01-01/)).toBeInTheDocument();
  });

  it("closes modal when close button is clicked", async () => {
    render(<PrivacyPolicy />);
    fireEvent.click(screen.getByRole("button", { name: "Privacy Policy" }));
    expect(screen.getByText("Privacy Policy Title")).toBeInTheDocument();
    // Click the footer close button (text "Close", not the X button with aria-label)
    fireEvent.click(screen.getByText("Close"));
    await waitFor(() => {
      expect(screen.queryByText("Privacy Policy Title")).not.toBeInTheDocument();
    });
  });
});

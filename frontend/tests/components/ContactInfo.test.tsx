import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ContactInfo from "@/components/ContactInfo";

const publicSettings = {
  maintenance_mode: false,
  public_email: "info@example.com",
  public_phone: "+32 59 12 34 56",
  facebook_url: "https://www.facebook.com/example",
};

vi.mock("@/hooks/useMaintenanceMode", () => ({
  usePublicSettings: () => publicSettings,
}));

vi.mock("@/paraglide/messages", () => ({
  m: {
    contact_alternative_contact: () => "Or contact us directly:",
    contact_email_label: () => "Email:",
    contact_phone_label: () => "Phone:",
  },
}));

describe("ContactInfo component", () => {
  it("renders the alternative contact message", () => {
    render(<ContactInfo />);
    expect(screen.getByText("Or contact us directly:")).toBeInTheDocument();
  });

  it("renders the email address as a mailto link", () => {
    render(<ContactInfo />);
    const emailLink = screen.getByRole("link", { name: /email/i });
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute("href", expect.stringContaining("mailto:"));
  });

  it("renders the phone number as a tel link", () => {
    render(<ContactInfo />);
    const phoneLink = screen.getByRole("link", { name: /phone/i });
    expect(phoneLink).toBeInTheDocument();
    expect(phoneLink).toHaveAttribute("href", expect.stringContaining("tel:"));
  });

  it("renders email and phone labels", () => {
    render(<ContactInfo />);
    expect(screen.getByText("Email:")).toBeInTheDocument();
    expect(screen.getByText("Phone:")).toBeInTheDocument();
  });

  it("hides empty public contact actions", () => {
    publicSettings.public_email = "";
    publicSettings.public_phone = "";
    render(<ContactInfo />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    publicSettings.public_email = "info@example.com";
    publicSettings.public_phone = "+32 59 12 34 56";
  });
});

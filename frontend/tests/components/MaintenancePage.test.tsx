import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MaintenancePage from "@/components/MaintenancePage";

let facebookUrl = "https://www.facebook.com/runtime";

vi.mock("@/hooks/useMaintenanceMode", () => ({
  usePublicSettings: () => ({ facebook_url: facebookUrl }),
}));

vi.mock("@/paraglide/messages", () => ({
  m: {
    festival_name: () => "Champagnefestival",
    maintenance_title: () => "We will be back soon",
    maintenance_message: () => "Maintenance in progress",
    maintenance_facebook_cta: () => "Follow us on Facebook",
    maintenance_flyer_alt: () => "Festival flyer",
    maintenance_flyer_placeholder: () => "Flyer coming soon",
    maintenance_flyer_open: () => "Open flyer",
    maintenance_flyer_close: () => "Close flyer",
    maintenance_flyer_unavailable: () => "Flyer unavailable",
  },
}));

afterEach(() => {
  facebookUrl = "https://www.facebook.com/runtime";
});

describe("MaintenancePage", () => {
  it("uses the runtime Facebook URL", () => {
    render(<MaintenancePage />);
    expect(screen.getByRole("link", { name: "Follow us on Facebook" })).toHaveAttribute(
      "href",
      facebookUrl,
    );
  });

  it("styles itself with owned classes instead of an embedded stylesheet or inline styles", () => {
    const { container } = render(<MaintenancePage />);
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("[style]")).toBeNull();
    expect(container.querySelector(".maintenance-page__title")).toBeInTheDocument();
  });

  it("hides the Facebook action when the setting is empty", () => {
    facebookUrl = "";
    render(<MaintenancePage />);
    expect(screen.queryByRole("link", { name: "Follow us on Facebook" })).not.toBeInTheDocument();
  });

  it("shows the uploaded flyer, falls back to the static one and then to the placeholder", () => {
    const uploaded = `/uploads/editions/${"a".repeat(32)}-${"b".repeat(64)}.jpg`;
    const { container } = render(<MaintenancePage flyerImage={uploaded} />);
    const image = () => container.querySelector("img.maintenance-page__flyer-image");
    expect(image()).toHaveAttribute("src", uploaded);

    fireEvent.error(image()!);
    expect(image()).toHaveAttribute("src", "/images/flyer.jpg");

    fireEvent.error(image()!);
    expect(image()).toBeNull();
    expect(container.querySelector(".maintenance-page__flyer-placeholder")).toBeInTheDocument();
  });

  it("never loads an unmanaged flyer path", () => {
    const { container } = render(<MaintenancePage flyerImage="https://evil.example/x.jpg" />);
    expect(container.querySelector("img.maintenance-page__flyer-image")).toHaveAttribute(
      "src",
      "/images/flyer.jpg",
    );
  });
});

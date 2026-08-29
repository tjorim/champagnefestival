import { render, screen } from "@testing-library/react";
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

  it("hides the Facebook action when the setting is empty", () => {
    facebookUrl = "";
    render(<MaintenancePage />);
    expect(screen.queryByRole("link", { name: "Follow us on Facebook" })).not.toBeInTheDocument();
  });
});

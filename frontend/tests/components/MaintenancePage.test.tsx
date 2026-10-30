import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import MaintenancePage from "@/components/MaintenancePage";

let facebookUrl = "https://www.facebook.com/runtime";

vi.mock("@/hooks/useMaintenanceMode", () => ({
  usePublicSettings: () => ({ facebook_url: facebookUrl }),
}));

vi.mock("@/paraglide/messages", () => ({
  m: {
    close: () => "Close",
    festival_name: () => "Champagnefestival",
    language_select: () => "Select language",
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

  it("offers the language switcher so visitors can leave the detected language", async () => {
    render(<MaintenancePage />);
    expect(await screen.findByRole("button", { name: /select language/i })).toBeInTheDocument();
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

  it("opens the flyer in a modal dialog, closes on Escape and returns focus to the flyer", async () => {
    const user = userEvent.setup();
    render(<MaintenancePage />);

    const trigger = screen.getByRole("button", { name: "Festival flyer" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Festival flyer" });
    expect(await axe(dialog)).toHaveNoViolations();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes the flyer dialog from its close button and returns focus", async () => {
    const user = userEvent.setup();
    render(<MaintenancePage />);

    const trigger = screen.getByRole("button", { name: "Festival flyer" });
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

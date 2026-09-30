import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { AreaIcon } from "@/components/AreaIcon";

describe("SVG icons", () => {
  it.each(["light", "dark"])(
    "keeps controls named and icons decorative in a %s scope",
    async (mode) => {
      const { container } = render(
        <div data-theme-mode={mode}>
          <button type="button" aria-label="Delete area">
            <Icon icon={TrashIcon} />
          </button>
          <button type="button">
            <AreaIcon name="bi-glass-champagne" />
            Champagne stand
          </button>
        </div>,
      );
      expect(screen.getByRole("button", { name: "Delete area" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Champagne stand" })).toBeInTheDocument();
      for (const svg of container.querySelectorAll("svg")) {
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(svg).toHaveAttribute("focusable", "false");
        expect(svg).toHaveAttribute("width", "1em");
        expect(svg).toHaveAttribute("stroke", "currentColor");
      }
      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it.each([
    ["bi-glass-champagne", "lucide-wine"],
    ["bi-person-standing", "lucide-accessibility"],
    ["bi-people-fill", "lucide-users"],
    ["bi-shop", "lucide-store"],
    ["unknown", "lucide-store"],
    ["toString", "lucide-store"],
    [null, "lucide-store"],
  ])("renders saved area identifier %s without an icon font", (name, svgClass) => {
    const { container } = render(<AreaIcon name={name} />);
    expect(container.querySelector("svg")).toHaveClass(svgClass ?? "lucide-store");
    expect(container.querySelector("i, .bi")).toBeNull();
  });
});

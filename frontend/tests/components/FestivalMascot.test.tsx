import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FestivalMascot from "@/components/FestivalMascot";

describe("FestivalMascot", () => {
  it("is a decorative, responsive image with reserved dimensions", () => {
    const { container } = render(<FestivalMascot />);
    const image = container.querySelector("img");

    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveAttribute("width", "360");
    expect(image).toHaveAttribute("height", "845");
    expect(image?.getAttribute("srcset")).toContain("/images/mascot-720.webp 720w");
  });

  it("offers a half-length crop for stacked layouts", () => {
    const { container } = render(<FestivalMascot crop="half" />);
    const image = container.querySelector("img");

    expect(image).toHaveAttribute("src", "/images/mascot-half-360.webp");
    expect(image).toHaveAttribute("height", "534");
  });
});

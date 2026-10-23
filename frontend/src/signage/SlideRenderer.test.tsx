import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { m } from "@/paraglide/messages";
import { SlideRenderer } from "./SlideRenderer";
import type { Layer, PublicSlide } from "./types";

function slide(binding: Layer["binding"]): PublicSlide {
  return {
    id: "sample",
    kind: "organization",
    duration: 10,
    title: null,
    text: null,
    image: null,
    icon: null,
    organization: {
      name: "Producer",
      logo: "/images/logo.svg",
      description: "Description",
      sponsor: true,
    },
    template: {
      background: { kind: "color", color: "#000000", end_color: "#000000", image: null },
      layers: [
        {
          id: "binding",
          kind: "binding",
          binding,
          text: "",
          image: null,
          icon: null,
          shape: "rectangle",
          x: 10,
          y: 20,
          width: 30,
          height: 40,
          rotation: 15,
          color: "#ffffff",
          font_size: 48,
        },
      ],
    },
  };
}
describe("shared signage renderer", () => {
  it("renders the notice text exactly as the organiser typed it", () => {
    const content = slide("text");
    content.kind = "notice";
    content.text = "Geen honden\nNo dogs";
    const { container } = render(<SlideRenderer slide={content} />);
    expect(container.querySelector(".site-signage-layer")?.textContent).toBe(
      "Geen honden\nNo dogs",
    );
  });
  it("uses top-left percentage coordinates and clockwise rotation", () => {
    render(<SlideRenderer slide={slide("name")} />);
    expect(screen.getByText("Producer")).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "40%",
      transform: "rotate(15deg)",
    });
  });
  it("renders the translated sponsor badge and suppresses it for producers", () => {
    const content = slide("sponsor");
    const { rerender } = render(<SlideRenderer slide={content} />);
    expect(screen.getByText(m.admin_item_sponsor())).toBeInTheDocument();
    content.organization!.sponsor = false;
    rerender(<SlideRenderer slide={content} />);
    expect(screen.queryByText(m.admin_item_sponsor())).not.toBeInTheDocument();
  });
  it("renders supported notice icons and safely ignores unknown names", () => {
    const content = slide("icon");
    content.icon = "cigarette-off";
    const { container, rerender } = render(<SlideRenderer slide={content} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    content.icon = "unknown-icon";
    rerender(<SlideRenderer slide={content} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    content.icon = "constructor";
    rerender(<SlideRenderer slide={content} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });
  it("shares visibility and typography across player and editor", () => {
    const content = slide("name");
    Object.assign(content.template.layers[0]!, { font: "serif", align: "left", visible: false });
    const { rerender } = render(<SlideRenderer slide={content} />);
    expect(screen.queryByText("Producer")).not.toBeInTheDocument();
    content.template.layers[0]!.visible = true;
    rerender(<SlideRenderer slide={content} />);
    expect(screen.getByText("Producer")).toHaveStyle({
      fontFamily: "Georgia, serif",
      textAlign: "left",
    });
  });
  it("uses the template image fit in the shared renderer", () => {
    const content = slide("logo");
    content.template.layers[0]!.fit = "cover";
    const { container } = render(<SlideRenderer slide={content} />);
    expect(container.querySelector("img")).toHaveStyle({ objectFit: "cover" });
  });
  it("binds a logo as an image rather than rendering the URL as text", () => {
    const { container } = render(<SlideRenderer slide={slide("logo")} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/images/logo.svg");
    expect(screen.queryByText("/images/logo.svg")).not.toBeInTheDocument();
  });
});

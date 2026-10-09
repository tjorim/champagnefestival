import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LogoWall from "@/components/LogoWall";
import type { SliderItem } from "@/config/editions";

vi.mock("@/paraglide/runtime", () => ({ getLocale: () => "en" }));
vi.mock("@/paraglide/messages", () => ({
  m: {
    logo_wall_show_all_producers: ({ count }: { count: number }) => `Show all ${count} producers`,
    logo_wall_show_all_vendors: ({ count }: { count: number }) => `Show all ${count} vendors`,
    logo_wall_show_all_sponsors: ({ count }: { count: number }) => `Show all ${count} sponsors`,
    logo_wall_show_fewer: () => "Show fewer",
  },
}));

function makeItems(count: number): SliderItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Maison ${String.fromCharCode(65 + (index % 26))}${index}`,
    image: `/logo-${index}.png`,
  }));
}

describe("LogoWall", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<LogoWall itemsType="producers" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sorts items alphabetically by name and keeps image alt text", () => {
    render(
      <LogoWall
        itemsType="producers"
        items={[
          { id: 1, name: "Zeta", image: "/z.png" },
          { id: 2, name: "alpha", image: "/a.png" },
          { id: 3, name: "Émile", image: "/e.png" },
        ]}
      />,
    );
    const names = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(names).toEqual(["alpha", "Émile", "Zeta"]);
    expect(screen.getByAltText("alpha")).toHaveAttribute("src", "/a.png");
  });

  it("shows the localised description with the full text available", () => {
    render(
      <LogoWall
        itemsType="producers"
        items={[
          {
            id: 1,
            name: "Maison",
            image: "/m.png",
            description_en: "English text",
            description_nl: "Nederlandse tekst",
          },
        ]}
      />,
    );
    expect(screen.getByText("English text")).toHaveAttribute("title", "English text");
    expect(screen.queryByText("Nederlandse tekst")).not.toBeInTheDocument();
  });

  it("limits producers to eight and toggles the rest accessibly", () => {
    render(<LogoWall itemsType="producers" items={makeItems(10)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);

    const toggle = screen.getByRole("button", { name: "Show all 10 producers" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")).toBe(
      screen.getByRole("list"),
    );

    fireEvent.click(toggle);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(fewer);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("has no toggle at or below the limit", () => {
    render(<LogoWall itemsType="vendors" items={makeItems(8)} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders sponsors as description-free tiles with a higher limit", () => {
    const items = makeItems(12).map((item) => ({ ...item, description_en: "Hidden" }));
    render(<LogoWall itemsType="sponsors" items={items} />);
    const wall = document.querySelector('[data-slot="logo-wall"]') as HTMLElement;
    expect(within(wall).getAllByRole("listitem")).toHaveLength(12);
    expect(within(wall).queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the festival logo when an image fails", () => {
    render(<LogoWall itemsType="sponsors" items={makeItems(1)} />);
    const image = screen.getByRole("img");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", "/images/logo.svg");
  });
});

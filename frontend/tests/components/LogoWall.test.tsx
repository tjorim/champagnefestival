import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LogoWall from "@/components/LogoWall";
import type { SliderItem } from "@/config/editions";
import type { OrganizationStands } from "@/utils/standsApi";

vi.mock("@/paraglide/runtime", () => ({ getLocale: () => "en" }));
vi.mock("@/paraglide/messages", () => ({
  m: {
    logo_wall_show_all_producers: ({ count }: { count: number }) => `Show all ${count} producers`,
    logo_wall_show_all_vendors: ({ count }: { count: number }) => `Show all ${count} vendors`,
    logo_wall_show_all_sponsors: ({ count }: { count: number }) => `Show all ${count} sponsors`,
    logo_wall_show_fewer: () => "Show fewer",
    logo_wall_search_label: () => "Find a producer",
    logo_wall_search_placeholder: () => "Search by name or stand",
    logo_wall_search_results: ({ count }: { count: number }) => `${count} producers found`,
    logo_wall_search_no_results: ({ query }: { query: string }) => `No producers match “${query}”.`,
    close: () => "Close",
    organization_modal_stands: () => "Where to find them",
    organization_modal_website: () => "Visit website",
    sponsor_tier_main: () => "Main sponsors",
    sponsor_tier_partner: () => "Partners",
    sponsor_tier_supporter: () => "Supporters",
    logo_wall_stand: () => "Stand",
    logo_wall_stand_on_day: ({ day, stand }: { day: string; stand: string }) => `${day}: ${stand}`,
  },
}));

function makeItems(count: number): SliderItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Maison ${String.fromCharCode(65 + (index % 26))}${index}`,
    image: `/logo-${index}.png`,
  }));
}

const items: SliderItem[] = [
  { id: 1, name: "Bollinger", image: "/b.png" },
  { id: 2, name: "Krug", image: "/k.png" },
  { id: 3, name: "Moët & Chandon", image: "/m.png" },
];

const stands: OrganizationStands[] = [
  {
    organization_id: 1,
    name: "Bollinger",
    stands: [
      { event_id: "e1", date: "2099-03-20", room_name: "Hall 5", label: "Stand 12" },
      { event_id: "e2", date: "2099-03-21", room_name: "Hall 5", label: "Stand 12" },
    ],
  },
  {
    organization_id: 3,
    name: "Moët & Chandon",
    stands: [
      { event_id: "e1", date: "2099-03-20", room_name: "Hall 5", label: "Stand 3" },
      { event_id: "e2", date: "2099-03-21", room_name: "Cellar", label: "Stand 9" },
    ],
  },
];

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
    expect(screen.queryByRole("button", { name: /show/i })).not.toBeInTheDocument();
  });

  it("renders sponsors as description-free tiles with a higher limit", () => {
    const items = makeItems(12).map((item) => ({ ...item, description_en: "Hidden" }));
    render(<LogoWall itemsType="sponsors" items={items} />);
    const wall = document.querySelector('[data-slot="logo-wall"]') as HTMLElement;
    expect(within(wall).getAllByRole("listitem")).toHaveLength(12);
    expect(within(wall).queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show/i })).not.toBeInTheDocument();
  });

  it("falls back to the festival logo when an image fails", () => {
    render(<LogoWall itemsType="sponsors" items={makeItems(1)} />);
    const image = screen.getByRole("img");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", "/images/logo.svg");
  });

  function card(name: string): HTMLElement {
    return screen.getByRole("heading", { name }).closest("[data-slot='logo-card']") as HTMLElement;
  }

  it("shows the stand on assigned producers and nothing on the others", () => {
    render(<LogoWall items={items} stands={stands} />);

    // Same spot on both days: one line, with the room because the lineup spans two rooms.
    expect(within(card("Bollinger")).getByText("Stand 12 · Hall 5")).toBeTruthy();
    // Different spot per day: one line per day.
    const moet = card("Moët & Chandon");
    expect(within(moet).getByText(/Stand 3 · Hall 5/)).toBeTruthy();
    expect(within(moet).getByText(/Stand 9 · Cellar/)).toBeTruthy();
    expect(card("Krug").querySelector("[data-slot='logo-stand']")).toBeNull();
  });

  it("renders without stand lines when no stands are available", () => {
    render(<LogoWall items={items} />);

    expect(document.querySelector("[data-slot='logo-stand']")).toBeNull();
    expect(screen.getByRole("heading", { name: "Krug" })).toBeTruthy();
  });

  it("finds a producer by name, accent-insensitively, or by stand", () => {
    render(<LogoWall items={items} stands={stands} />);
    const search = screen.getByLabelText("Find a producer");

    fireEvent.change(search, { target: { value: "moet" } });
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Moët & Chandon",
    ]);

    fireEvent.change(search, { target: { value: "stand 12" } });
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Bollinger",
    ]);

    fireEvent.change(search, { target: { value: "cellar" } });
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Moët & Chandon",
    ]);
  });

  it("explains an empty search and restores the list when cleared", () => {
    render(<LogoWall items={items} stands={stands} />);
    const search = screen.getByLabelText("Find a producer");

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No producers match “zzz”.")).toBeTruthy();
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("shows every match for a search instead of the collapsed subset", () => {
    const many: SliderItem[] = Array.from({ length: 12 }, (_, index) => ({
      id: 100 + index,
      name: `House ${String(index).padStart(2, "0")}`,
      image: "/x.png",
    }));
    render(<LogoWall items={many} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(8);

    fireEvent.change(screen.getByLabelText("Find a producer"), { target: { value: "house" } });

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(12);
    expect(screen.queryByRole("button", { name: /show/i })).toBeNull();
  });

  it("shows stands on sponsor and vendor walls too", () => {
    render(<LogoWall itemsType="sponsors" items={items} stands={stands} />);
    expect(within(card("Bollinger")).getByText("Stand 12 · Hall 5")).toBeInTheDocument();

    cleanup();
    render(<LogoWall itemsType="vendors" items={items} stands={stands} />);
    expect(within(card("Bollinger")).getByText("Stand 12 · Hall 5")).toBeInTheDocument();
  });

  it("opens the details of an organization from its card", async () => {
    const detailed: SliderItem[] = [
      {
        id: 1,
        name: "Bollinger",
        image: "/b.png",
        website: "https://bollinger.example/",
        description_en: "A full description that is longer than the two lines on the card.",
      },
      { id: 2, name: "Krug", image: "/k.png", website: "javascript:alert(1)" },
    ];
    render(<LogoWall items={detailed} stands={stands} />);

    fireEvent.click(screen.getByRole("button", { name: "Bollinger" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Bollinger" })).toBeInTheDocument();
    expect(
      within(dialog).getByText("A full description that is longer than the two lines on the card."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Where to find them")).toBeInTheDocument();
    // Every day is listed with its stand and room, even when they are all the same.
    expect(within(dialog).getAllByText(/Stand 12 · Hall 5/)).toHaveLength(2);
    expect(within(dialog).getByRole("link", { name: /Visit website/ })).toHaveAttribute(
      "href",
      "https://bollinger.example/",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("omits stands and ignores unsafe website links in the details", () => {
    render(
      <LogoWall
        items={[{ id: 2, name: "Krug", image: "/k.png", website: "javascript:alert(1)" }]}
        stands={stands}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Krug" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Where to find them")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers no search on sponsor walls", () => {
    render(<LogoWall itemsType="sponsors" items={items} />);

    expect(screen.queryByLabelText("Find a producer")).toBeNull();
  });

  describe("sponsor order and levels", () => {
    const sponsors: SliderItem[] = [
      { id: 1, name: "Zeta", image: "/z.png", sponsor_tier: "supporter" },
      { id: 2, name: "Alpha", image: "/a.png", sponsor_tier: "main" },
      { id: 3, name: "Mid", image: "/m.png", sponsor_tier: null },
      { id: 4, name: "Beta", image: "/b.png", sponsor_tier: "supporter" },
      { id: 5, name: "Omega", image: "/o.png", sponsor_tier: "partner" },
    ];

    function names(): string[] {
      const wall = document.querySelector('[data-slot="logo-wall"]') as HTMLElement;
      return within(wall)
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");
    }

    it("keeps the lineup order instead of sorting sponsors alphabetically", () => {
      render(
        <LogoWall
          itemsType="sponsors"
          items={[
            { id: 1, name: "Zeta", image: "/z.png" },
            { id: 2, name: "Alpha", image: "/a.png" },
            { id: 3, name: "Mid", image: "/m.png" },
          ]}
        />,
      );

      expect(names()).toEqual(["Zeta", "Alpha", "Mid"]);
      // Without levels there are no level headings and one group.
      expect(document.querySelectorAll("[data-slot='logo-group']")).toHaveLength(1);
      expect(screen.queryByText("Supporters")).toBeNull();
    });

    it("groups sponsors by level under headings, untiered sponsors last, lineup order within a level", () => {
      render(<LogoWall itemsType="sponsors" items={sponsors} />);

      expect(names()).toEqual(["Alpha", "Omega", "Zeta", "Beta", "Mid"]);
      const groups = [...document.querySelectorAll<HTMLElement>("[data-slot='logo-group']")];
      expect(groups.map((group) => group.dataset.tier ?? "none")).toEqual([
        "main",
        "partner",
        "supporter",
        "none",
      ]);
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
        "Main sponsors",
        "Partners",
        "Supporters",
      ]);
      // Logo names sit below the level headings.
      expect(screen.getByRole("heading", { level: 4, name: "Alpha" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Main sponsors" })).toBeInTheDocument();
    });

    it("gives higher levels larger tiles", () => {
      render(<LogoWall itemsType="sponsors" items={sponsors} />);

      const tileClass = (name: string) =>
        (screen.getByText(name).closest("li") as HTMLElement).className;
      expect(tileClass("Alpha")).toContain("sm:w-64");
      expect(tileClass("Omega")).toContain("sm:w-52");
      expect(tileClass("Zeta")).toContain("sm:w-40");
    });

    it("collapses the lowest levels first", () => {
      const many: SliderItem[] = [
        ...Array.from({ length: 12 }, (_, index) => ({
          id: index + 1,
          name: `Supporter ${index}`,
          image: "/s.png",
          sponsor_tier: "supporter" as const,
        })),
        { id: 99, name: "Late main", image: "/l.png", sponsor_tier: "main" },
      ];
      render(<LogoWall itemsType="sponsors" items={many} />);

      expect(names()[0]).toBe("Late main");
      expect(names()).toHaveLength(12);
      expect(screen.queryByText("Supporter 11")).toBeNull();
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditionLineupOrder } from "@/components/admin/EditionLineupOrder";
import { apiToEdition } from "@/components/admin/editionTypes";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) =>
        args.length ? `${key}:${(args[0] as { name?: string }).name ?? ""}` : key;
    },
  }),
}));

const entries = [
  { id: 1, name: "Zeta", type: "sponsor" },
  { id: 2, name: "Bollinger", type: "producer" },
  { id: 3, name: "Alpha", type: "sponsor" },
];

describe("EditionLineupOrder", () => {
  it("lists the lineup in order and offers a level only for sponsors", () => {
    render(
      <EditionLineupOrder
        entries={entries}
        tiers={{ 1: "main" }}
        onMove={vi.fn()}
        onTierChange={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Zeta"),
      expect.stringContaining("Bollinger"),
      expect.stringContaining("Alpha"),
    ]);
    expect(
      screen.getByRole("combobox", { name: "admin_edition_sponsor_level:Zeta" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "admin_edition_sponsor_level:Bollinger" }),
    ).toBeNull();
  });

  it("moves an entry with the arrow buttons and stops at the ends", async () => {
    const onMove = vi.fn();
    render(
      <EditionLineupOrder entries={entries} tiers={{}} onMove={onMove} onTierChange={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: "admin_edition_lineup_move_up:Zeta" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "admin_edition_lineup_move_down:Alpha" }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "admin_edition_lineup_move_down:Zeta" }),
    );
    expect(onMove).toHaveBeenCalledWith(0, 1);
    await userEvent.click(
      screen.getByRole("button", { name: "admin_edition_lineup_move_up:Alpha" }),
    );
    expect(onMove).toHaveBeenCalledWith(2, 1);
  });

  it("renders nothing for an empty lineup", () => {
    const { container } = render(
      <EditionLineupOrder entries={[]} tiers={{}} onMove={vi.fn()} onTierChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("apiToEdition lineup", () => {
  it("reads the lineup order and sponsor levels, ignoring unknown levels", () => {
    const edition = apiToEdition({
      id: "e",
      organizations: [5, 3],
      producers: [{ id: 5, name: "Krug" }],
      sponsors: [
        { id: 3, name: "Acme", sponsor_tier: "partner" },
        { id: 4, name: "Other", sponsor_tier: "platinum" },
      ],
    });

    expect(edition.organizationIds).toEqual([5, 3]);
    expect(edition.sponsors?.map((sponsor) => sponsor.sponsorTier)).toEqual(["partner", null]);
  });
});

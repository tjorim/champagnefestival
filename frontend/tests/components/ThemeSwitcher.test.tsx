import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { VISUAL_THEMES } from "@/config/visualThemes";

describe("ThemeSwitcher", () => {
  it("renders every preview option with the active option pressed", () => {
    render(<ThemeSwitcher variant="remuage" onChange={vi.fn()} />);

    const group = screen.getByRole("group", { name: /visual design preview switcher/i });
    const buttons = within(group).getAllByRole("button");

    expect(buttons.map((button) => button.textContent)).toEqual(
      VISUAL_THEMES.map((theme) => theme.label),
    );
    expect(screen.getByRole("button", { name: "Remuage" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reports the selected registered variant", () => {
    const onChange = vi.fn();
    render(<ThemeSwitcher variant="refresh" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remuage" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("remuage");
  });

  it("supports the compact select control", () => {
    const onChange = vi.fn();
    render(<ThemeSwitcher variant="refresh" onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: /visual design preview/i }), {
      target: { value: "remuage" },
    });

    expect(onChange).toHaveBeenCalledWith("remuage");
  });
});

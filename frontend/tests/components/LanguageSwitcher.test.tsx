import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import LanguageSwitcher from "@/components/LanguageSwitcher";

vi.mock("@/paraglide/runtime", () => ({
  defineCustomClientStrategy: vi.fn(),
  getLocale: vi.fn().mockReturnValue("nl"),
  setLocale: vi.fn(),
  isLocale: vi.fn().mockReturnValue(true),
}));

vi.mock("@/paraglide/messages", () => ({
  m: {
    language_select: () => "Select language",
  },
}));

describe("LanguageSwitcher component", () => {
  it("renders after hydration", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: /select language/i })).toBeInTheDocument();
  });

  it("shows current language code in toggle", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    const code = screen.getByText("NL");
    expect(code).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "NL: Select language" })).toHaveAccessibleName(
      expect.stringContaining(code.textContent!),
    );
  });

  it("shows all three language options in dropdown", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /select language/i }));
    // Each option shows the language name in the interface language (Dutch here) and its native name
    expect(screen.getByText("Engels")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getAllByText("Nederlands")).toHaveLength(2);
    expect(screen.getByText("Frans")).toBeInTheDocument();
    expect(screen.getByText("Français")).toBeInTheDocument();
  });

  it("calls setLocale when a language is selected", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    const { setLocale } = await import("@/paraglide/runtime");
    render(<LanguageSwitcher />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /select language/i }));
    // Click French option (nativeName 'Français' is unique)
    fireEvent.click(screen.getByText("Français").closest('[role="menuitem"]')!);
    expect(setLocale).toHaveBeenCalledWith("fr", { reload: false });
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(new URL("/fr", window.location.href).href),
    );
    assign.mockRestore();
  });

  it("shows a checkmark for the active language", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /select language/i }));
    // The active language (nl) should have the highlighted class
    const dutchItem = screen.getAllByText("Nederlands")[0]!.closest('[role="menuitem"]');
    expect(dutchItem?.querySelector("svg")).toBeInTheDocument();
  });
});

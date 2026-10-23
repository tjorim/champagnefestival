import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function renderTabs(variant?: "default" | "line", themed = false) {
  render(
    <Tabs defaultValue="one" themed={themed}>
      <TabsList variant={variant} aria-label="Sections">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First</TabsContent>
      <TabsContent value="two">Second</TabsContent>
    </Tabs>,
  );
}

describe("Tabs", () => {
  it("keeps the explicit themed mode available for public runtime themes", () => {
    renderTabs(undefined, true);

    expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "themed");
    expect(screen.getByRole("tab", { name: "One" })).not.toHaveClass("border");
  });

  it("uses the generated default surface when no themed mode is requested", () => {
    renderTabs();
    expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "default");
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "One" })).toHaveTextContent("First");
  });

  it("passes vertical orientation through to Base UI keyboard navigation", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="one" orientation="vertical">
        <TabsList aria-label="Vertical sections">
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First</TabsContent>
        <TabsContent value="two">Second</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
    screen.getByRole("tab", { name: "One" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Two" })).toHaveTextContent("Second");
  });

  it("associates line tabs with their panels and supports keyboard navigation", async () => {
    const user = userEvent.setup();
    renderTabs("line");

    expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "line");
    const first = screen.getByRole("tab", { name: "One" });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "One" })).toHaveTextContent("First");
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Two" })).toHaveTextContent("Second");
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");
  });
});

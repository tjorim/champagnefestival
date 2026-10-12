import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function renderTabs(variant?: "default" | "pills") {
  render(
    <Tabs defaultValue="one">
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
  it("leaves the default variant unstyled for runtime themes", () => {
    renderTabs();

    expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "default");
    expect(screen.getByRole("tab", { name: "One" })).not.toHaveClass("border");
  });

  it("styles the pills variant as bordered buttons with a primary active tab", () => {
    renderTabs("pills");

    expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "pills");
    const tab = screen.getByRole("tab", { name: "One" });
    expect(tab).toHaveClass("rounded-md", "border", "data-active:bg-primary");
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("First")).toBeInTheDocument();
  });
});

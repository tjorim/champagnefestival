import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonLink } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

describe("Button", () => {
  it("is a native button that defaults to type=button and exposes its variant", () => {
    render(
      <>
        <Button>Plain</Button>
        <Button type="submit" variant="outline-danger" size="sm">
          Save
        </Button>
      </>,
    );
    const plain = screen.getByRole("button", { name: "Plain" });
    expect(plain).toHaveAttribute("type", "button");
    expect(plain).toHaveAttribute("data-variant", "default");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("type", "submit");
    expect(save).toHaveAttribute("data-variant", "outline-danger");
    expect(save).toHaveAttribute("data-size", "sm");
    expect(save.className).not.toMatch(/(^|\s)btn(-|\s|$)/);
  });

  it("does not fire onClick while disabled and keeps icon-only names", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button disabled onClick={onClick}>
          Off
        </Button>
        <Button size="icon-xs" aria-label="Close panel" onClick={onClick} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(onClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("ButtonLink", () => {
  it("renders a real link, not a button", () => {
    render(
      <ButtonLink href="mailto:a@example.com" variant="outline-warning">
        Mail
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Mail" });
    expect(link).toHaveAttribute("href", "mailto:a@example.com");
    expect(link).not.toHaveAttribute("role");
    expect(link).toHaveAttribute("data-slot", "button");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("styles a custom element passed as render", () => {
    render(
      <ButtonLink render={<a href="/home" data-testid="home" />} size="sm">
        Home
      </ButtonLink>,
    );
    const link = screen.getByTestId("home");
    expect(link).toHaveAttribute("href", "/home");
    expect(link).toHaveTextContent("Home");
    expect(link).toHaveAttribute("data-size", "sm");
  });
});

describe("ButtonLink with a router-style link component", () => {
  it("passes styling, hooks and children through to the rendered component", () => {
    function RouterLink({ to, ...props }: ComponentProps<"a"> & { to: string }) {
      return <a href={to} {...props} />;
    }
    render(
      <ButtonLink
        render={<RouterLink to="/venue-plan" />}
        variant="outline-warning"
        className="w-full"
      >
        Show table
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Show table" });
    expect(link).toHaveAttribute("href", "/venue-plan");
    expect(link).toHaveAttribute("data-variant", "outline-warning");
    expect(link.className).toContain("w-full");
    expect(link).not.toHaveAttribute("role");
  });
});

describe("ButtonGroup", () => {
  it("is a labelled group with pressed state on its buttons and no a11y violations", async () => {
    const { container } = render(
      <ButtonGroup aria-label="Filter by status">
        <Button aria-pressed>All</Button>
        <Button aria-pressed={false}>Pending</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole("group", { name: "Filter by status" });
    expect(group).toContainElement(screen.getByRole("button", { name: "All", pressed: true }));
    expect(screen.getByRole("button", { name: "Pending", pressed: false })).toBeInTheDocument();
    expect(group.className).not.toMatch(/btn-group/);
    expect(await axe(container)).toHaveNoViolations();
  });
});

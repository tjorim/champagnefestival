import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { expect, it } from "vitest";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

it("preserves disclosure state and the trigger/panel relationship", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <Collapsible>
      <CollapsibleTrigger>Manual search</CollapsibleTrigger>
      <CollapsibleContent keepMounted>
        <input aria-label="Search bookings" />
      </CollapsibleContent>
    </Collapsible>,
  );
  const trigger = screen.getByRole("button", { name: "Manual search" });
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  trigger.focus();
  await user.keyboard("{Enter}");
  const input = screen.getByRole("textbox");
  await user.type(input, "Visitor");
  await user.click(trigger);
  await user.click(trigger);
  expect(screen.getByRole("textbox")).toHaveValue("Visitor");
  expect((await axe(container)).violations).toEqual([]);
});

it("exposes the progress value and label accessibly", async () => {
  const { container } = render(<Progress value={40} aria-label="Festival check-ins" />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  expect((await axe(container)).violations).toEqual([]);
});

it("opens an admin tooltip from keyboard focus and carries portal scope", async () => {
  const user = userEvent.setup();
  render(
    <Tooltip>
      <TooltipTrigger>Producer</TooltipTrigger>
      <TooltipContent admin>Used in editions: 2026</TooltipContent>
    </Tooltip>,
  );
  await user.tab();
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.closest('[data-theme-scope="admin"]')).toBeInTheDocument();
  expect((await axe(tooltip)).violations).toEqual([]);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("dismisses a tooltip when the pointer leaves its trigger", async () => {
  const user = userEvent.setup();
  render(
    <Tooltip>
      <TooltipTrigger>Producer</TooltipTrigger>
      <TooltipContent>Used in editions: 2026</TooltipContent>
    </Tooltip>,
  );
  const trigger = screen.getByRole("button", { name: "Producer" });
  await user.hover(trigger);
  expect(await screen.findByRole("tooltip")).toBeVisible();
  await user.unhover(trigger);
  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
});

it("dismisses a tooltip when keyboard focus moves away", async () => {
  const user = userEvent.setup();
  render(
    <>
      <Tooltip>
        <TooltipTrigger>Producer</TooltipTrigger>
        <TooltipContent>Used in editions: 2026</TooltipContent>
      </Tooltip>
      <button>Next control</button>
    </>,
  );
  await user.tab();
  expect(await screen.findByRole("tooltip")).toBeVisible();
  await user.tab();
  expect(screen.getByRole("button", { name: "Next control" })).toHaveFocus();
  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
});

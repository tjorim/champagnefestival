import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";

describe("actionable presentation lists", () => {
  it("keeps list semantics and supports keyboard selection without submitting a surrounding form", async () => {
    const select = vi.fn();
    const submit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <PresentationList>
          <PresentationListItem action onClick={select}>
            Select booking
          </PresentationListItem>
          <PresentationListItem action disabled onClick={select}>
            Unavailable booking
          </PresentationListItem>
        </PresentationList>
      </form>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Select booking" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(select).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Unavailable booking" })).toBeDisabled();
  });
});

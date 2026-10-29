import { render, screen } from "@testing-library/react";
import { PencilIcon, TrashIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { AdminAddButton, RowActionButton, RowActions } from "@/components/admin/RowActions";

describe("RowActions", () => {
  it("names each icon button after the action and puts the destructive one last", () => {
    render(
      <RowActions
        destructive={<RowActionButton destructive icon={TrashIcon} label="Delete March 2027" />}
      >
        <RowActionButton icon={PencilIcon} label="Edit March 2027" />
      </RowActions>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Edit March 2027",
      "Delete March 2027",
    ]);
    expect(buttons[1]).toHaveAttribute("title", "Delete March 2027");
    expect(buttons[1]).toHaveAttribute("data-variant", "outline-danger");
    expect(buttons[1]?.parentElement?.querySelector("span[aria-hidden]")).not.toBeNull();
  });

  it("renders no divider when there is only a destructive action", () => {
    const { container } = render(
      <RowActions
        destructive={<RowActionButton destructive icon={TrashIcon} label="Delete X" />}
      />,
    );
    expect(container.querySelector("span[aria-hidden]")).toBeNull();
  });
});

describe("AdminAddButton", () => {
  it("is a labelled button", () => {
    render(<AdminAddButton>Add venue</AdminAddButton>);
    const button = screen.getByRole("button", { name: "Add venue" });
    expect(button).toHaveAttribute("data-variant", "outline-primary");
    expect(button.querySelector("svg.lucide-plus")).not.toBeNull();
  });
});

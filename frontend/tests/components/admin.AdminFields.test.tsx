import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminCheck,
  AdminDescription,
  AdminError,
  AdminField,
  AdminInput,
  AdminLabel,
  AdminOption,
  AdminOptionGroup,
  AdminSelect,
} from "@/components/admin/AdminFields";
import { readAdminOptions, selectAdminOption } from "../helpers/adminSelect";

function Selection() {
  const [value, setValue] = useState("a");
  return (
    <AdminField>
      <AdminLabel>Category</AdminLabel>
      <AdminSelect value={value} onValueChange={setValue}>
        <AdminOption value="">No category</AdminOption>
        <AdminOptionGroup label="Available">
          <AdminOption value="a">Alpha</AdminOption>
          <AdminOption value="b">Beta</AdminOption>
        </AdminOptionGroup>
        <AdminOption value="disabled" disabled>
          Unavailable
        </AdminOption>
      </AdminSelect>
    </AdminField>
  );
}

describe("owned admin fields", () => {
  it("associates generated labels, descriptions and errors through render props", async () => {
    const user = userEvent.setup();
    const blur = vi.fn();
    render(
      <AdminField>
        <AdminLabel>Quantity</AdminLabel>
        <AdminInput type="number" aria-invalid onBlur={blur} />
        <AdminDescription>Enter a whole number</AdminDescription>
        <AdminError>Quantity is required</AdminError>
      </AdminField>,
    );
    const input = screen.getByRole("spinbutton", { name: "Quantity" });
    expect(input).toHaveAccessibleDescription("Enter a whole number Quantity is required");
    await user.click(screen.getByText("Quantity", { exact: true }));
    expect(input).toHaveFocus();
    await user.tab();
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it("keeps grouped options, empty-string selection and disabled options", async () => {
    render(<Selection />);
    const select = screen.getByRole("combobox", { name: "Category" });
    expect((await readAdminOptions(select)).map((option) => option.value)).toEqual([
      "",
      "a",
      "b",
      "disabled",
    ]);
    await selectAdminOption(select, "b");
    expect(select).toHaveTextContent("Beta");
    await selectAdminOption(select, "");
    expect(select).toHaveTextContent("No category");
    fireEvent.click(select);
    expect(await screen.findByRole("option", { name: "Unavailable" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("selects by keyboard and returns focus after dismissal", async () => {
    const user = userEvent.setup();
    render(<Selection />);
    const select = screen.getByRole("combobox", { name: "Category" });
    select.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(select).toHaveTextContent("Beta");
    await user.keyboard("{ArrowDown}{Escape}");
    expect(select).toHaveFocus();
  });

  it("labels switches and respects pending disabled state without submitting", async () => {
    const change = vi.fn();
    const submit = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <form onSubmit={submit}>
        <AdminCheck type="switch" label="Active" checked={false} onCheckedChange={change} />
      </form>,
    );
    await user.click(screen.getByText("Active"));
    expect(change).toHaveBeenCalledWith(true, expect.anything());
    expect(submit).not.toHaveBeenCalled();
    rerender(
      <form onSubmit={submit}>
        <AdminCheck
          type="switch"
          label="Active"
          checked={false}
          disabled
          onCheckedChange={change}
        />
      </form>,
    );
    await user.click(screen.getByRole("switch", { name: "Active" }));
    expect(change).toHaveBeenCalledTimes(1);
  });
});

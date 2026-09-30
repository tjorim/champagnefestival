import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { expect, it, vi } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";

vi.mock("@/paraglide/messages", () => ({ m: { close: () => "Close" } }));

function Harness({ admin = false, guarded = false }: { admin?: boolean; guarded?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Edit person</button>
      <Dialog
        open={open}
        onOpenChange={(next, details) => {
          if (!next && guarded && dirty) details.cancel();
          else setOpen(next);
        }}
      >
        <DialogContent admin={admin}>
          <DialogHeader>
            <DialogTitle>Edit person</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <label htmlFor="person-name">Name</label>
            <input id="person-name" onChange={() => setDirty(true)} />
            <button onClick={() => setDirty(false)}>Discard changes</button>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

it.each([false, true])(
  "labels the dialog and carries the appropriate portal theme (admin=%s)",
  async (admin) => {
    const { container } = render(<Harness admin={admin} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit person" }));
    const dialog = screen.getByRole("dialog", { name: "Edit person" });
    expect(container.contains(dialog)).toBe(false);
    expect(Boolean(dialog.closest('[data-theme-scope="admin"]'))).toBe(admin);
    expect(await axe(dialog)).toHaveNoViolations();
  },
);

it("dismisses by Escape and outside press, returning focus", async () => {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Edit person" });
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
  await userEvent.click(trigger);
  await userEvent.click(document.querySelector('[data-slot="dialog-overlay"]')!);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("allows a dirty-form guard to reject every dismissal path without losing input", async () => {
  render(<Harness guarded />);
  await userEvent.click(screen.getByRole("button", { name: "Edit person" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
  await userEvent.keyboard("{Escape}");
  await userEvent.click(document.querySelector('[data-slot="dialog-overlay"]')!);
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toHaveValue("Alice");
  await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

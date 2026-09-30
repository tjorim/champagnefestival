import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import ConfirmModal from "@/components/ConfirmModal";

vi.mock("@/paraglide/messages", () => ({
  m: {
    close: () => "Close",
    admin_action_cancel: () => "Cancel",
    admin_action_confirm: () => "Confirm",
  },
}));

function Harness({
  onConfirm,
  admin = false,
}: {
  onConfirm: () => Promise<void>;
  admin?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <button onClick={() => setShow(true)}>Delete booking</button>
      <ConfirmModal
        show={show}
        admin={admin}
        title="Delete booking?"
        body="This deletes the booking."
        errorFallback="Failed"
        onConfirm={onConfirm}
        onHide={() => setShow(false)}
      />
    </>
  );
}

describe("ConfirmModal", () => {
  it.each([false, true])(
    "is accessible and scopes only admin confirmations to dark (admin=%s)",
    async (admin) => {
      render(<Harness admin={admin} onConfirm={vi.fn()} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete booking" }));
      const dialog = screen.getByRole("alertdialog", { name: "Delete booking?" });
      expect(dialog).toHaveAccessibleDescription("This deletes the booking.");
      expect(Boolean(dialog.closest('[data-theme-scope="admin"]'))).toBe(admin);
      expect(await axe(dialog)).toHaveNoViolations();
    },
  );

  it("dismisses with Escape and returns focus to the opener", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Delete booking" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("preserves backdrop dismissal", async () => {
    render(<Harness onConfirm={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete booking" }));
    fireEvent.click(document.querySelector('[data-slot="alert-dialog-overlay"]')!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("blocks dismissal and duplicate confirmation while pending, then closes on success", async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete booking" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    fireEvent.click(document.querySelector('[data-slot="alert-dialog-overlay"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("keeps errors visible and clears them before reopening", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Server refused"));
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete booking" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server refused");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Delete booking" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

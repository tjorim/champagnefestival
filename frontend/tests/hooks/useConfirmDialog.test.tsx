/**
 * The promise-based confirm must always settle.
 *
 * These call sites ask mid-`await` — the caller is parked on the promise while
 * the dialog is open, so any path that leaves it unsettled hangs the action
 * with no error and no dialog, which is the same silent-nothing-happens
 * failure that dropping `window.confirm` was meant to end (#935).
 */

import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

const REQUEST = {
  title: "Delete announcement",
  body: "Delete this announcement?",
  errorFallback: "Failed to delete the announcement.",
};

/** Renders the dialog the hook hands back, so it can actually be clicked. */
function Harness({ onReady }: { onReady: (confirm: ReturnType<typeof useConfirmDialog>) => void }) {
  const api = useConfirmDialog();
  onReady(api);
  return <>{api.confirmDialog}</>;
}

describe("useConfirmDialog", () => {
  it("resolves true when confirmed and false when cancelled", async () => {
    const user = userEvent.setup();
    let api!: ReturnType<typeof useConfirmDialog>;
    render(<Harness onReady={(next) => (api = next)} />);

    const confirmed = api.confirm(REQUEST);
    await screen.findByText("Delete this announcement?");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await expect(confirmed).resolves.toBe(true);

    // The dialog closes rather than lingering over the page.
    await waitFor(() => expect(screen.queryByText("Delete this announcement?")).toBeNull());

    const cancelled = api.confirm(REQUEST);
    await screen.findByText("Delete this announcement?");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(cancelled).resolves.toBe(false);
  });

  it("settles a confirmed promise exactly once", async () => {
    // ConfirmModal calls its own onHide after a successful onConfirm. Without
    // the ref being cleared first that second call would resolve again, and a
    // caller reading the settled value would still see `true` while any
    // follow-up bookkeeping ran twice.
    const user = userEvent.setup();
    let api!: ReturnType<typeof useConfirmDialog>;
    render(<Harness onReady={(next) => (api = next)} />);

    const settled: boolean[] = [];
    void api.confirm(REQUEST).then((value) => settled.push(value));
    await screen.findByText("Delete this announcement?");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(settled).toEqual([true]));
  });

  it("cancels a pending request when a second one supersedes it", async () => {
    // Otherwise the first caller waits forever on a dialog that is no longer
    // on screen.
    const { result } = renderHook(() => useConfirmDialog());

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.confirm(REQUEST);
      second = result.current.confirm({ ...REQUEST, body: "Discard this draft?" });
    });

    await expect(first).resolves.toBe(false);
    expect(second).toBeInstanceOf(Promise);
  });

  it("renders nothing until a confirmation is requested", () => {
    const { result } = renderHook(() => useConfirmDialog());
    expect(result.current.confirmDialog).toBeNull();
  });
});

import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import PersonFormModal from "./PersonFormModal";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";

afterEach(cleanup);

const person = {
  id: "p1",
  name: "Alice",
  email: "alice@example.com",
  phone: null,
  address: null,
  preferredLanguage: null,
  roles: ["member"],
  notes: null,
} as unknown as Person;

function Harness({
  initial,
  onSave = vi.fn().mockResolvedValue(undefined),
}: {
  initial: Person | null;
  onSave?: () => Promise<void>;
}) {
  const [show, setShow] = useState(true);
  const [current, setCurrent] = useState(initial);
  return (
    <>
      <button onClick={() => setCurrent(current && { ...current, phone: "0123" })}>refresh</button>
      <button onClick={() => setShow(true)}>reopen</button>
      <PersonFormModal show={show} person={current} onSave={onSave} onHide={() => setShow(false)} />
    </>
  );
}

const nameField = () => screen.getByLabelText(`${m.registration_name()} *`) as HTMLInputElement;

it("closes a pristine form on Escape without asking", async () => {
  const user = userEvent.setup();
  render(<Harness initial={null} />);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByText(m.admin_editor_discard_title())).toBeNull();
});

it("asks before discarding a new person typed in, and Keep editing retains the draft", async () => {
  const user = userEvent.setup();
  render(<Harness initial={null} />);
  await user.type(nameField(), "Unsaved review person");
  await user.keyboard("{Escape}");
  expect(await screen.findByText(m.admin_editor_discard_title())).toBeTruthy();
  await user.click(screen.getByRole("button", { name: m.admin_editor_keep_editing() }));
  await waitFor(() => expect(screen.queryByText(m.admin_editor_discard_title())).toBeNull());
  expect(nameField().value).toBe("Unsaved review person");
  await waitFor(() => expect(document.activeElement).toBe(nameField()));
});

it("discards a dirty edit deliberately and reopens from the record", async () => {
  const user = userEvent.setup();
  render(<Harness initial={person} />);
  await user.type(nameField(), " draft");
  await user.click(screen.getByRole("button", { name: m.admin_action_cancel() }));
  await user.click(await screen.findByRole("button", { name: m.admin_editor_discard_changes() }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "reopen", hidden: true }));
  expect((await screen.findByRole("dialog")) && nameField().value).toBe("Alice");
});

it("keeps the draft and its baseline when the record is refreshed from the server", async () => {
  const user = userEvent.setup();
  render(<Harness initial={person} />);
  await user.type(nameField(), " draft");
  await user.click(screen.getByRole("button", { name: "refresh", hidden: true }));
  expect(nameField().value).toBe("Alice draft");
  expect((screen.getByLabelText(m.registration_phone()) as HTMLInputElement).value).toBe("");
  await user.keyboard("{Escape}");
  expect(await screen.findByText(m.admin_editor_discard_title())).toBeTruthy();
});

it("treats a refresh alone as no edit", async () => {
  const user = userEvent.setup();
  render(<Harness initial={person} />);
  await user.click(screen.getByRole("button", { name: "refresh", hidden: true }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByText(m.admin_editor_discard_title())).toBeNull();
});

it("does not prompt once the draft is back at its baseline", async () => {
  const user = userEvent.setup();
  render(<Harness initial={person} />);
  await user.type(nameField(), "x");
  await user.keyboard("{Backspace}");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("closes without a prompt after a successful save", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<Harness initial={null} onSave={onSave} />);
  await user.type(nameField(), "Bob");
  await user.click(screen.getByRole("button", { name: m.admin_people_save() }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByText(m.admin_editor_discard_title())).toBeNull();
});

it("keeps the dialog and draft open when a save fails", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockRejectedValue(new Error("offline"));
  render(<Harness initial={null} onSave={onSave} />);
  await user.type(nameField(), "Bob");
  await user.click(screen.getByRole("button", { name: m.admin_people_save() }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(nameField().value).toBe("Bob");
});

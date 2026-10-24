import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MemberFormModal from "./MemberFormModal";
import { m } from "@/paraglide/messages";

afterEach(cleanup);

it("saves the inactivity exemption and reason with a new member", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<MemberFormModal show limitReached member={null} onSave={onSave} onHide={vi.fn()} />);
  expect(screen.getByText(m.admin_members_limit_warning())).toBeTruthy();
  fireEvent.change(screen.getByLabelText(`${m.registration_name()} *`), {
    target: { value: "Alice" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: m.admin_members_inactivity_exempt() }));
  fireEvent.change(screen.getByLabelText(m.admin_members_exempt_note()), {
    target: { value: "Reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: m.admin_people_save() }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alice",
        inactivityExempt: true,
        inactivityExemptNote: "Reason",
      }),
    ),
  );
});

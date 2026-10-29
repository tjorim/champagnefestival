import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import PersonFormModal from "./PersonFormModal";
import MemberFormModal from "./MemberFormModal";
import VolunteerFormModal from "./VolunteerFormModal";
import { ApiError } from "@/utils/apiErrors";
import { m } from "@/paraglide/messages";
afterEach(cleanup);
it.each(["person", "member", "volunteer"])(
  "associates %s errors and preserves correction drafts",
  async (kind) => {
    const user = userEvent.setup();
    const identity = kind === "volunteer";
    const save = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError("DO NOT DISPLAY", {
          status: 422,
          code: identity ? "person_niss_conflict" : "person_invalid_phone",
        }),
      )
      .mockResolvedValue(undefined);
    const hide = vi.fn();
    if (kind === "person")
      render(<PersonFormModal show person={null} onSave={save} onHide={hide} />);
    if (kind === "member")
      render(<MemberFormModal show member={null} onSave={save} onHide={hide} />);
    if (identity) render(<VolunteerFormModal show volunteer={null} onSave={save} onHide={hide} />);
    const name = document.getElementById(`${kind}-name`)!;
    const input = document.getElementById(
      `${kind}-${identity ? "national-register-number" : "phone"}`,
    )!;
    await user.type(name, "Draft person");
    await user.type(input, "123");
    const submit = document.querySelector('button[type="submit"]')!;
    await user.click(submit);
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(input.getAttribute("aria-describedby")).toContain(`${input.id}-error`);
    expect(document.getElementById(`${input.id}-error`)?.textContent).toBe(
      identity ? m.admin_person_identity_conflict() : m.admin_person_invalid_phone(),
    );
    expect(document.activeElement).toBe(input);
    expect((name as HTMLInputElement).value).toBe("Draft person");
    expect(screen.queryByText("DO NOT DISPLAY")).toBeNull();
    expect(hide).not.toHaveBeenCalled();
    await user.clear(input);
    await user.click(submit);
    await waitFor(() => expect(hide).toHaveBeenCalledOnce());
  },
);
it("associates unsupported server email input", async () => {
  const user = userEvent.setup();
  render(
    <PersonFormModal
      show
      person={null}
      onHide={vi.fn()}
      onSave={vi
        .fn()
        .mockRejectedValue(new ApiError("English diagnostic", { status: 422, fields: ["email"] }))}
    />,
  );
  await user.type(document.getElementById("person-name")!, "Guest");
  await user.type(document.getElementById("person-email")!, "guest@example.test");
  await user.click(document.querySelector('button[type="submit"]')!);
  await waitFor(() => expect(document.activeElement?.id).toBe("person-email"));
  expect(document.getElementById("person-email-error")?.textContent).toBe(
    m.admin_person_invalid_email(),
  );
});

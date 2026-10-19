import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import VolunteerFormModal from "@/components/admin/VolunteerFormModal";
import { apiToPerson } from "@/types/person";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

function mount(edit = false) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onHide = vi.fn();
  render(
    <VolunteerFormModal
      show
      volunteer={
        edit
          ? apiToPerson({ id: "volunteer", name: "Alice", roles: ["volunteer"], help_periods: [] })
          : null
      }
      onSave={onSave}
      onHide={onHide}
    />,
  );
  return { onSave, onHide, save: screen.getByRole("button", { name: "admin_people_save" }) };
}

describe("optional volunteer details", () => {
  it("creates a volunteer with only a name", async () => {
    const user = userEvent.setup();
    const { onSave, onHide, save } = mount();
    expect(save).toBeDisabled();
    expect(screen.getByLabelText("admin_people_national_register_number_label")).not.toBeRequired();
    expect(screen.getByLabelText("admin_people_eid_document_number_label")).not.toBeRequired();
    expect(screen.queryByLabelText(/admin_volunteers_period_start_label/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/registration_name/), { target: { value: " Alice " } });
    await user.click(save);
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Alice",
        address: "",
        nationalRegisterNumber: "",
        eidDocumentNumber: "",
        helpPeriods: [],
      }),
    );
    expect(onHide).toHaveBeenCalledOnce();
  });

  it("edits a person marked as a volunteer without adding identity or a period", async () => {
    const user = userEvent.setup();
    const { onSave, save } = mount(true);
    fireEvent.change(screen.getByLabelText(/registration_name/), {
      target: { value: "Updated Alice" },
    });
    await user.click(save);
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Updated Alice", helpPeriods: [] }),
      ),
    );
  });

  it("requires a start date for an added period and lets the last period be removed", async () => {
    const user = userEvent.setup();
    const { onSave, save } = mount(true);
    await user.click(screen.getByRole("button", { name: "admin_volunteers_add_help_period" }));
    const start = screen.getByLabelText(/admin_volunteers_period_start_label/);
    expect(start).toBeRequired();
    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "admin_volunteers_remove_help_period" }));
    await user.click(save);
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ helpPeriods: [] })),
    );
  });
});

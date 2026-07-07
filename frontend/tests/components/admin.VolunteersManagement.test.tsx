import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import VolunteersManagement from "@/components/admin/VolunteersManagement";
import type { Person } from "@/types/person";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

function makeVolunteer(overrides: Partial<Person> = {}): Person {
  return {
    id: "volunteer-1",
    name: "Cara Volunteer",
    email: "",
    phone: "",
    address: "3 Helper Ave",
    roles: ["volunteer"],
    nationalRegisterNumber: "12.34.56-789.01",
    eidDocumentNumber: "EID123456",
    visitsPerMonth: null,
    clubName: "",
    notes: "",
    active: true,
    helpPeriods: [],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

interface RenderOpts {
  volunteers?: Person[];
  isLoading?: boolean;
  onCreate?: (data: unknown) => Promise<void>;
  onUpdate?: (id: string, data: unknown) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

function renderVolunteersManagement(opts: RenderOpts = {}) {
  const onCreate = opts.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = opts.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onDelete = opts.onDelete ?? vi.fn().mockResolvedValue(undefined);

  render(
    <VolunteersManagement
      volunteers={opts.volunteers ?? [makeVolunteer()]}
      isLoading={opts.isLoading ?? false}
      authHeaders={() => ({})}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />,
  );

  return { onCreate, onUpdate, onDelete };
}

describe("VolunteersManagement — rendering", () => {
  it("renders volunteer rows with name, address, national register number, eID number, and help periods", () => {
    renderVolunteersManagement({
      volunteers: [
        makeVolunteer({
          id: "v1",
          name: "With Period",
          helpPeriods: [{ id: 1, firstHelpDay: "2025-03-01", lastHelpDay: "2025-03-02" }],
        }),
        makeVolunteer({ id: "v2", name: "No Period", helpPeriods: [] }),
      ],
    });

    const rowWithPeriod = screen.getByText("With Period").closest("tr");
    const scopedWithPeriod = within(rowWithPeriod as HTMLElement);
    expect(scopedWithPeriod.getByText("3 Helper Ave")).toBeInTheDocument();
    expect(scopedWithPeriod.getByText("12.34.56-789.01")).toBeInTheDocument();
    expect(scopedWithPeriod.getByText("EID123456")).toBeInTheDocument();
    expect(scopedWithPeriod.getByText("2025-03-01 → 2025-03-02")).toBeInTheDocument();

    const rowNoPeriod = screen.getByText("No Period").closest("tr");
    expect(within(rowNoPeriod as HTMLElement).getByText("admin_volunteers_no_help_periods")).toBeInTheDocument();
  });

  it("shows a loading spinner instead of the table when isLoading is true", () => {
    renderVolunteersManagement({ isLoading: true, volunteers: [] });
    expect(document.querySelector(".spinner-border")).toBeTruthy();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the no-results message when volunteers is empty and not loading", () => {
    renderVolunteersManagement({ volunteers: [], isLoading: false });
    expect(screen.getByText("admin_volunteers_no_results")).toBeInTheDocument();
  });
});

describe("VolunteersManagement — add volunteer flow", () => {
  it("opens the VolunteerFormModal, fills the required fields, and calls onCreate with expected shape", async () => {
    const { onCreate } = renderVolunteersManagement({ volunteers: [] });

    fireEvent.click(screen.getByRole("button", { name: "admin_volunteers_add" }));

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);

    fireEvent.change(scoped.getByLabelText(/registration_name/), {
      target: { value: "  New Volunteer  " },
    });
    fireEvent.change(scoped.getByLabelText(/admin_people_national_register_number_label/), {
      target: { value: "  99.99.99-999.99  " },
    });
    fireEvent.change(scoped.getByLabelText(/admin_people_eid_document_number_label/), {
      target: { value: "  EIDNEW1  " },
    });
    fireEvent.change(scoped.getByLabelText(/admin_volunteers_period_start_label/), {
      target: { value: "2025-06-01" },
    });

    fireEvent.click(scoped.getByRole("button", { name: "admin_people_save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Volunteer",
        nationalRegisterNumber: "99.99.99-999.99",
        eidDocumentNumber: "EIDNEW1",
        active: true,
        helpPeriods: [{ firstHelpDay: "2025-06-01", lastHelpDay: null }],
      }),
    );
  });
});

describe("VolunteersManagement — delete confirmation", () => {
  it("requires modal confirmation before calling onDelete", async () => {
    const { onDelete } = renderVolunteersManagement({
      volunteers: [makeVolunteer({ id: "v1" })],
    });

    fireEvent.click(screen.getByRole("button", { name: "admin_volunteers_delete_title" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("admin_volunteers_delete_confirm")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "admin_action_cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "admin_volunteers_delete_title" }));
    const dialog2 = await screen.findByRole("dialog");
    fireEvent.click(within(dialog2).getByRole("button", { name: "admin_action_confirm" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("v1");
  });
});

describe("VolunteersManagement — active/inactive filter", () => {
  it("filters rows to only inactive volunteers when 'inactive' is selected", () => {
    renderVolunteersManagement({
      volunteers: [
        makeVolunteer({ id: "v1", name: "Active Vera", active: true }),
        makeVolunteer({ id: "v2", name: "Inactive Ivo", active: false }),
      ],
    });

    expect(screen.getByText("Active Vera")).toBeInTheDocument();
    expect(screen.getByText("Inactive Ivo")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "admin_people_active_label" }), {
      target: { value: "inactive" },
    });

    expect(screen.queryByText("Active Vera")).not.toBeInTheDocument();
    expect(screen.getByText("Inactive Ivo")).toBeInTheDocument();
  });
});

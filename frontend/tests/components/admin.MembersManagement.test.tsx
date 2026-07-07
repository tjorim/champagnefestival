import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MembersManagement from "@/components/admin/MembersManagement";
import type { Person } from "@/types/person";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

function makeMember(overrides: Partial<Person> = {}): Person {
  return {
    id: "member-1",
    name: "Bob Member",
    email: "bob@example.com",
    phone: "+32 470 11 11 11",
    address: "2 Side St",
    roles: ["member"],
    nationalRegisterNumber: null,
    eidDocumentNumber: null,
    visitsPerMonth: null,
    clubName: "Wine Club",
    notes: "Prefers red wine",
    active: true,
    helpPeriods: [],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

interface RenderOpts {
  members?: Person[];
  registrationCountByPersonId?: Record<string, number>;
  isLoading?: boolean;
  onCreate?: (data: unknown) => Promise<void>;
  onUpdate?: (id: string, data: unknown) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

function renderMembersManagement(opts: RenderOpts = {}) {
  const onCreate = opts.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = opts.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onDelete = opts.onDelete ?? vi.fn().mockResolvedValue(undefined);

  render(
    <MembersManagement
      members={opts.members ?? [makeMember()]}
      registrationCountByPersonId={opts.registrationCountByPersonId ?? {}}
      isLoading={opts.isLoading ?? false}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />,
  );

  return { onCreate, onUpdate, onDelete };
}

describe("MembersManagement — rendering", () => {
  it("renders member rows with name, email, phone, club name, notes, and registration count", () => {
    renderMembersManagement({
      members: [makeMember({ id: "m1" })],
      registrationCountByPersonId: { m1: 5 },
    });

    const row = screen.getByText("Bob Member").closest("tr");
    expect(row).not.toBeNull();
    const scoped = within(row as HTMLElement);
    expect(scoped.getByText("bob@example.com")).toBeInTheDocument();
    expect(scoped.getByText("+32 470 11 11 11")).toBeInTheDocument();
    expect(scoped.getByText("Wine Club")).toBeInTheDocument();
    expect(scoped.getByText("Prefers red wine")).toBeInTheDocument();
    expect(scoped.getByText("5")).toBeInTheDocument();
  });

  it("shows a loading spinner instead of the table when isLoading is true", () => {
    renderMembersManagement({ isLoading: true, members: [] });
    expect(document.querySelector(".spinner-border")).toBeTruthy();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the no-results message when members is empty and not loading", () => {
    renderMembersManagement({ members: [], isLoading: false });
    expect(screen.getByText("admin_members_no_results")).toBeInTheDocument();
  });
});

describe("MembersManagement — add member flow", () => {
  it("opens the MemberFormModal, fills the name, and calls onCreate with trimmed values", async () => {
    const { onCreate } = renderMembersManagement({ members: [] });

    fireEvent.click(screen.getByRole("button", { name: "admin_members_add" }));

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);

    const nameInput = scoped.getByLabelText(/registration_name/);
    fireEvent.change(nameInput, { target: { value: "  New Member  " } });

    fireEvent.click(scoped.getByRole("button", { name: "admin_people_save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Member",
        email: "",
        phone: "",
        address: "",
        clubName: "",
        notes: "",
        active: true,
      }),
    );
  });
});

describe("MembersManagement — delete confirmation", () => {
  it("requires modal confirmation before calling onDelete", async () => {
    const { onDelete } = renderMembersManagement({
      members: [makeMember({ id: "m1" })],
    });

    fireEvent.click(screen.getByRole("button", { name: "admin_members_delete_title" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("admin_members_delete_confirm")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "admin_action_cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "admin_members_delete_title" }));
    const dialog2 = await screen.findByRole("dialog");
    fireEvent.click(within(dialog2).getByRole("button", { name: "admin_members_delete_title" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("m1");
  });
});

describe("MembersManagement — active/inactive filter", () => {
  it("filters rows to only inactive members when 'inactive' is selected", () => {
    renderMembersManagement({
      members: [
        makeMember({ id: "m1", name: "Active Ann", active: true }),
        makeMember({ id: "m2", name: "Inactive Ian", active: false }),
      ],
    });

    expect(screen.getByText("Active Ann")).toBeInTheDocument();
    expect(screen.getByText("Inactive Ian")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "admin_people_active_label" }), {
      target: { value: "inactive" },
    });

    expect(screen.queryByText("Active Ann")).not.toBeInTheDocument();
    expect(screen.getByText("Inactive Ian")).toBeInTheDocument();
  });
});

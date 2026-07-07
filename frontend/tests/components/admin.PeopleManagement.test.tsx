import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import PeopleManagement from "@/components/admin/PeopleManagement";
import type { Person } from "@/types/person";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "person-1",
    name: "Alice Example",
    email: "alice@example.com",
    phone: "+32 470 00 00 00",
    address: "1 Main St",
    roles: ["member"],
    nationalRegisterNumber: null,
    eidDocumentNumber: null,
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
  people?: Person[];
  registrationCountByPersonId?: Record<string, number>;
  isLoading?: boolean;
  onMerge?: (canonicalId: string, duplicateId: string) => Promise<void>;
  onCreate?: (data: unknown) => Promise<void>;
  onUpdate?: (id: string, data: unknown) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

function renderPeopleManagement(opts: RenderOpts = {}) {
  const queryClient = createTestQueryClient();
  const onMerge = opts.onMerge ?? vi.fn().mockResolvedValue(undefined);
  const onCreate = opts.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = opts.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onDelete = opts.onDelete ?? vi.fn().mockResolvedValue(undefined);

  render(
    <QueryClientProvider client={queryClient}>
      <PeopleManagement
        people={opts.people ?? [makePerson()]}
        registrationCountByPersonId={opts.registrationCountByPersonId ?? {}}
        isLoading={opts.isLoading ?? false}
        authHeaders={() => ({})}
        onMerge={onMerge}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </QueryClientProvider>,
  );

  return { onMerge, onCreate, onUpdate, onDelete };
}

describe("PeopleManagement — rendering", () => {
  it("renders person rows with name, email, phone, role badges, and registration count", () => {
    renderPeopleManagement({
      people: [makePerson({ id: "p1", roles: ["member", "volunteer"] })],
      registrationCountByPersonId: { p1: 3 },
    });

    const row = screen.getByText("Alice Example").closest("tr");
    expect(row).not.toBeNull();
    const scoped = within(row as HTMLElement);
    expect(scoped.getByText("alice@example.com")).toBeInTheDocument();
    expect(scoped.getByText("+32 470 00 00 00")).toBeInTheDocument();
    expect(scoped.getByText("member")).toBeInTheDocument();
    expect(scoped.getByText("volunteer")).toBeInTheDocument();
    expect(scoped.getByText("3")).toBeInTheDocument();
  });

  it("shows a loading spinner instead of the table when isLoading is true", () => {
    renderPeopleManagement({ isLoading: true, people: [] });
    expect(document.querySelector(".spinner-border")).toBeTruthy();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the no-results message when people is empty and not loading", () => {
    renderPeopleManagement({ people: [], isLoading: false });
    expect(screen.getByText("admin_people_no_results")).toBeInTheDocument();
  });
});

describe("PeopleManagement — add person flow", () => {
  it("opens the PersonFormModal, fills the name, and calls onCreate with trimmed values", async () => {
    const { onCreate } = renderPeopleManagement({ people: [] });

    fireEvent.click(screen.getByRole("button", { name: "admin_people_add_person" }));

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);

    const nameInput = scoped.getByLabelText(/registration_name/);
    fireEvent.change(nameInput, { target: { value: "  New Person  " } });

    fireEvent.click(scoped.getByRole("button", { name: "admin_people_save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Person",
        email: "",
        phone: "",
        address: "",
        roles: [],
        notes: "",
        clubName: "",
        active: true,
      }),
    );
  });
});

describe("PeopleManagement — delete confirmation", () => {
  it("requires modal confirmation before calling onDelete", async () => {
    const { onDelete } = renderPeopleManagement({
      people: [makePerson({ id: "p1" })],
    });

    fireEvent.click(screen.getByRole("button", { name: "admin_people_delete_title" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("admin_people_delete_confirm")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "admin_action_cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "admin_people_delete_title" }));
    const dialog2 = await screen.findByRole("dialog");
    fireEvent.click(within(dialog2).getByRole("button", { name: "admin_action_confirm" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("p1");
  });
});

describe("PeopleManagement — merge duplicates", () => {
  it("shows a merge button for duplicate emails and calls onMerge on confirm", async () => {
    const { onMerge } = renderPeopleManagement({
      people: [
        makePerson({ id: "p1", name: "Alice Example", email: "dupe@example.com" }),
        makePerson({ id: "p2", name: "Alice Duplicate", email: "dupe@example.com" }),
      ],
    });

    const [mergeButton] = screen.getAllByRole("button", { name: /admin_people_merge_title/ });
    expect(mergeButton).toBeInTheDocument();
    fireEvent.click(mergeButton as HTMLElement);

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "admin_people_merge_confirm" }));

    expect(onMerge).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import TableTypeManagement from "@/components/admin/TableTypeManagement";
import type { TableType } from "@/types/admin";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const activeType: TableType = {
  id: "tt-1",
  name: "Standard Rectangle",
  shape: "rectangle",
  widthM: 0.7,
  lengthM: 1.8,
  heightType: "low",
  maxCapacity: 4,
  active: true,
};

const archivedType: TableType = {
  id: "tt-2",
  name: "Retired Round",
  shape: "round",
  widthM: 0.9,
  lengthM: 0.9,
  heightType: "high",
  maxCapacity: 2,
  active: false,
};

interface RenderOverrides {
  tableTypes?: TableType[];
  onAdd?: (data: Omit<TableType, "id">) => Promise<void>;
  onUpdate?: (id: string, data: Partial<Omit<TableType, "id">>) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  onRestore?: (id: string) => Promise<void>;
}

function renderTableTypeManagement(overrides: RenderOverrides = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onArchive = overrides.onArchive ?? vi.fn().mockResolvedValue(undefined);
  const onRestore = overrides.onRestore ?? vi.fn().mockResolvedValue(undefined);

  render(
    <TableTypeManagement
      tableTypes={overrides.tableTypes ?? [activeType, archivedType]}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onArchive={onArchive}
      onRestore={onRestore}
    />,
  );

  return { onAdd, onUpdate, onArchive, onRestore };
}

describe("TableTypeManagement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders table type rows with shape/width/length/height/capacity, and the archived badge with dimmed row styling", () => {
    renderTableTypeManagement();

    const activeRow = screen.getByText("Standard Rectangle").closest("tr") as HTMLElement;
    const activeScope = within(activeRow);
    expect(activeScope.getByText("admin_table_shape_rectangle")).toBeInTheDocument();
    expect(activeScope.getByText("0.7 m")).toBeInTheDocument();
    expect(activeScope.getByText("1.8 m")).toBeInTheDocument();
    expect(activeScope.getByText("admin_table_height_type_low")).toBeInTheDocument();
    expect(activeScope.getByText("4")).toBeInTheDocument();
    expect(activeRow.className).not.toContain("opacity-50");

    const archivedRow = screen.getByText("Retired Round").closest("tr") as HTMLElement;
    const archivedScope = within(archivedRow);
    expect(archivedScope.getByText("admin_venue_archived_badge")).toBeInTheDocument();
    expect(archivedScope.getByText("admin_table_shape_round")).toBeInTheDocument();
    expect(archivedRow.className).toContain("opacity-50");
  });

  it("shows the empty state when there are no table types", () => {
    renderTableTypeManagement({ tableTypes: [] });
    expect(screen.getByText("admin_no_table_types")).toBeInTheDocument();
  });

  it("disables Save until name and maxCapacity are valid, then calls onAdd with the expected rectangle shape object", async () => {
    const { onAdd } = renderTableTypeManagement({ tableTypes: [] });

    fireEvent.click(screen.getByRole("button", { name: "admin_add_table_type" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    const saveButton = dialogScope.getByRole("button", { name: "admin_save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(dialogScope.getByLabelText("admin_table_name"), {
      target: { value: "Banquet Rect" },
    });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    expect(onAdd).toHaveBeenCalledWith({
      name: "Banquet Rect",
      shape: "rectangle",
      widthM: 0.7,
      lengthM: 1.8,
      heightType: "low",
      maxCapacity: 4,
      active: true,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("switching the shape select to round updates default dimensions and swaps the width/length fields for a single diameter field", async () => {
    renderTableTypeManagement({ tableTypes: [] });

    fireEvent.click(screen.getByRole("button", { name: "admin_add_table_type" }));
    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);

    expect(dialogScope.queryByLabelText("admin_table_diameter_label")).not.toBeInTheDocument();
    expect(dialogScope.getByLabelText("admin_table_width_label")).toBeInTheDocument();
    expect(dialogScope.getByLabelText("admin_table_length_label")).toBeInTheDocument();

    fireEvent.change(dialogScope.getByLabelText("admin_table_shape_label"), {
      target: { value: "round" },
    });

    expect(dialogScope.queryByLabelText("admin_table_width_label")).not.toBeInTheDocument();
    expect(dialogScope.queryByLabelText("admin_table_length_label")).not.toBeInTheDocument();
    const diameterField = dialogScope.getByLabelText("admin_table_diameter_label") as HTMLInputElement;
    expect(diameterField.value).toBe("0.9");
  });

  it("pre-fills the edit form from the row's existing values and calls onUpdate without the active field", async () => {
    const { onUpdate } = renderTableTypeManagement();

    const activeRow = screen.getByText("Standard Rectangle").closest("tr") as HTMLElement;
    fireEvent.click(within(activeRow).getByRole("button", { name: "admin_edit" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    const nameInput = dialogScope.getByLabelText("admin_table_name") as HTMLInputElement;
    expect(nameInput.value).toBe("Standard Rectangle");

    fireEvent.change(nameInput, { target: { value: "Renamed Rectangle" } });
    fireEvent.click(dialogScope.getByRole("button", { name: "admin_save" }));

    expect(onUpdate).toHaveBeenCalledWith("tt-1", {
      name: "Renamed Rectangle",
      shape: "rectangle",
      widthM: 0.7,
      lengthM: 1.8,
      heightType: "low",
      maxCapacity: 4,
    });
    const callArgs = vi.mocked(onUpdate).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("active");
  });

  it("archives an active row immediately, with no confirm prompt", () => {
    const confirmSpy = vi.fn();
    vi.stubGlobal("confirm", confirmSpy);
    const { onArchive } = renderTableTypeManagement();

    const activeRow = screen.getByText("Standard Rectangle").closest("tr") as HTMLElement;
    fireEvent.click(within(activeRow).getByRole("button", { name: "admin_content_archive" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onArchive).toHaveBeenCalledWith("tt-1");
  });

  it("restores an archived row immediately, with no confirm prompt, and hides the edit button on archived rows", () => {
    const confirmSpy = vi.fn();
    vi.stubGlobal("confirm", confirmSpy);
    const { onRestore } = renderTableTypeManagement();

    const archivedRow = screen.getByText("Retired Round").closest("tr") as HTMLElement;
    expect(within(archivedRow).queryByRole("button", { name: "admin_edit" })).not.toBeInTheDocument();

    fireEvent.click(within(archivedRow).getByRole("button", { name: "admin_content_restore" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onRestore).toHaveBeenCalledWith("tt-2");
  });
});

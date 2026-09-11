import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import LayoutEditor, { getDayLabel } from "@/components/admin/LayoutEditor";
import type { FloorArea, FloorTable, Layout, Room, TableType } from "@/types/admin";
import type { Registration } from "@/types/registration";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const { fetchLayoutRevisions, compareLayoutRevisions, previewLayoutRestore } = vi.hoisted(() => ({
  fetchLayoutRevisions: vi.fn(),
  compareLayoutRevisions: vi.fn(),
  previewLayoutRestore: vi.fn(),
}));

vi.mock("@/utils/adminFetch", () => ({
  fetchLayoutRevisions,
  compareLayoutRevisions,
  previewLayoutRestore,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    venueId: "venue-1",
    name: "Main Hall",
    widthM: 10,
    lengthM: 8,
    color: "#ff0000",
    active: true,
    dimensionsPlaceholder: false,
    ...overrides,
  };
}

function makeRoom2(): Room {
  return makeRoom({ id: "room-2", name: "Garden Room", widthM: 8, lengthM: 6, color: "#00ff00" });
}

function makeTableType(overrides: Partial<TableType> = {}): TableType {
  return {
    id: "tt-1",
    name: "Round 8",
    venueId: "venue-1",
    shape: "round",
    widthM: 1.5,
    lengthM: 1.5,
    heightType: "low",
    capacity: 8,
    active: true,
    ...overrides,
  };
}

function makeLayout(overrides: Partial<Layout> = {}): Layout {
  return {
    id: "layout-1",
    eventId: "event-1",
    eventTitle: "Saturday",
    editionId: "edition-1",
    roomId: "room-1",
    date: "2026-08-01",
    label: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeLayout2(): Layout {
  return makeLayout({
    id: "layout-2",
    roomId: "room-2",
    date: "2026-08-02",
  });
}

function makeTable(overrides: Partial<FloorTable> = {}): FloorTable {
  return {
    id: "table-1",
    name: "Table A",
    capacity: 8,
    x: 10,
    y: 10,
    tableTypeId: "tt-1",
    rotation: 0,
    layoutId: "layout-1",
    registrationIds: [],
    ...overrides,
  };
}

function makeArea(overrides: Partial<FloorArea> = {}): FloorArea {
  return {
    id: "area-1",
    layoutId: "layout-1",
    icon: "bi-shop",
    exhibitorId: null,
    label: "Stand 1",
    x: 60,
    y: 60,
    rotation: 0,
    widthM: 1.5,
    lengthM: 1.0,
    ...overrides,
  };
}

function makeRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "reg-1",
    personId: "person-1",
    person: { id: "person-1", name: "Jane Doe", email: "jane@example.com", phone: "+32000" },
    eventId: "event-1",
    guestCount: 2,
    orderItems: [],
    notes: "",
    status: "confirmed",
    paymentStatus: "paid",
    checkedIn: false,
    strapIssued: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

interface RenderOverrides {
  dayOptions?: { eventId: string; date: string; label: string }[];
  tables?: FloorTable[];
  tableTypes?: TableType[];
  layouts?: Layout[];
  registrations?: Registration[];
  rooms?: Room[];
  exhibitors?: { id: number; name: string; active: boolean }[];
  areas?: FloorArea[];
}

function renderLayoutEditor(overrides: RenderOverrides = {}) {
  const callbacks = {
    onAddTable: vi.fn().mockResolvedValue(undefined),
    onMoveTable: vi.fn(),
    onDeleteTable: vi.fn().mockResolvedValue(undefined),
    onRotateTable: vi.fn(),
    onAddLayout: vi.fn().mockResolvedValue(undefined),
    onDeleteLayout: vi.fn().mockResolvedValue(undefined),
    onAddArea: vi.fn().mockResolvedValue(undefined),
    onMoveArea: vi.fn(),
    onDeleteArea: vi.fn().mockResolvedValue(undefined),
    onRotateArea: vi.fn(),
    onAssignAreaToItem: vi.fn().mockResolvedValue(undefined),
    onUpdateAreaLabel: vi.fn(),
    onChangeTableType: vi.fn().mockResolvedValue(undefined),
    onUpdateTable: vi.fn().mockResolvedValue(undefined),
    onResizeArea: vi.fn().mockResolvedValue(undefined),
    onSaveAllocations: vi.fn().mockResolvedValue(undefined),
    authHeaders: vi.fn().mockReturnValue({}),
    onSaveRevision: vi.fn().mockResolvedValue({
      id: "layrev-1",
      layoutId: "layout-1",
      revisionNumber: 1,
      label: "Revision",
      changeNote: null,
      createdBy: "admin",
      createdAt: "2026-01-01T00:00:00Z",
      snapshot: { tables: [], areas: [], room: { widthM: 10, lengthM: 8 } },
    }),
    onRestoreRevision: vi.fn().mockResolvedValue(undefined),
  };

  const utils = render(
    <LayoutEditor
      dayOptions={overrides.dayOptions ?? []}
      tables={overrides.tables ?? []}
      tableTypes={overrides.tableTypes ?? []}
      layouts={overrides.layouts ?? []}
      registrations={overrides.registrations ?? []}
      rooms={overrides.rooms ?? []}
      exhibitors={overrides.exhibitors ?? []}
      areas={overrides.areas ?? []}
      {...callbacks}
    />,
  );

  return { ...utils, callbacks };
}

function realisticFixture(): Required<
  Pick<
    RenderOverrides,
    | "dayOptions"
    | "tables"
    | "tableTypes"
    | "layouts"
    | "registrations"
    | "rooms"
    | "exhibitors"
    | "areas"
  >
> {
  return {
    dayOptions: [
      { eventId: "event-1", date: "2026-08-01", label: "Saturday" },
      { eventId: "event-2", date: "2026-08-02", label: "Sunday" },
    ],
    tables: [makeTable(), makeTable({ id: "table-2", name: "Table B", capacity: 6, x: 40, y: 40 })],
    tableTypes: [makeTableType()],
    layouts: [makeLayout()],
    registrations: [makeRegistration()],
    rooms: [makeRoom()],
    exhibitors: [{ id: 1, name: "Champagne House", active: true }],
    areas: [makeArea()],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getDayLabel", () => {
  const dayOptions = [{ eventId: "event-1", date: "2026-08-01", label: "Saturday — 08:00" }];

  it("prefers the active edition's day-option label when the event is found", () => {
    expect(getDayLabel(makeLayout({ eventId: "event-1" }), dayOptions)).toBe("Saturday — 08:00");
  });

  it("falls back to the layout's own event title and date when the event belongs to a different edition", () => {
    const lastYear = makeLayout({
      eventId: "event-old",
      eventTitle: "Breakfast tasting",
      date: "2025-08-01",
    });
    expect(getDayLabel(lastYear, dayOptions)).toBe(
      `Breakfast tasting — ${new Date("2025-08-01T00:00:00").toLocaleDateString()}`,
    );
  });

  it("falls back to the layout's own label when neither the day option nor an event title is available", () => {
    const noTitle = makeLayout({
      eventId: "event-old",
      eventTitle: "",
      date: null,
      label: "pre-event",
    });
    expect(getDayLabel(noTitle, dayOptions)).toBe("pre-event");
  });
});

describe("LayoutEditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchLayoutRevisions.mockReset().mockResolvedValue([]);
    compareLayoutRevisions.mockReset();
    previewLayoutRestore.mockReset();
  });

  it("renders the empty state when there are no rooms", () => {
    renderLayoutEditor();
    expect(screen.getByText("admin_room_no_rooms")).toBeInTheDocument();
  });

  it("renders a realistic fixture: room tab and table names appear", () => {
    renderLayoutEditor(realisticFixture());
    // "Main Hall" appears both in the room tab and the active-room header.
    expect(screen.getAllByText("Main Hall").length).toBeGreaterThan(0);
    expect(screen.getByText("Table A")).toBeInTheDocument();
    expect(screen.getByText("Table B")).toBeInTheDocument();
  });

  it("assigns an unallocated booking from the selected table on the plan", async () => {
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);
    fireEvent.click(screen.getByRole("button", { name: "admin_table_label Table A" }));
    fireEvent.change(screen.getByRole("combobox", { name: "admin_layout_assign_booking" }), {
      target: { value: "reg-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin_layout_assign_booking" }));
    await waitFor(() =>
      expect(callbacks.onSaveAllocations).toHaveBeenCalledWith("reg-1", [
        { tableId: "table-1", guestCount: 2, exclusive: false },
      ]),
    );
  });

  it("moves or removes an existing allocation from the selected table", async () => {
    const fixture = realisticFixture();
    fixture.tables[0] = makeTable({ registrationIds: ["reg-1"] });
    fixture.registrations[0] = makeRegistration({
      allocations: [{ tableId: "table-1", guestCount: 2, exclusive: false }],
    });
    const { callbacks } = renderLayoutEditor(fixture);
    fireEvent.click(screen.getByRole("button", { name: "admin_table_label Table A" }));
    fireEvent.change(screen.getByRole("combobox", { name: "admin_layout_move_booking Jane Doe" }), {
      target: { value: "table-2" },
    });
    await waitFor(() =>
      expect(callbacks.onSaveAllocations).toHaveBeenCalledWith("reg-1", [
        { tableId: "table-2", guestCount: 2, exclusive: false },
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "admin_layout_remove_booking" }));
    await waitFor(() => expect(callbacks.onSaveAllocations).toHaveBeenLastCalledWith("reg-1", []));
  });

  it("switches rooms when a different room tab is clicked", () => {
    const fixture = realisticFixture();
    fixture.rooms = [makeRoom(), makeRoom2()];
    fixture.layouts = [makeLayout(), makeLayout2()];
    fixture.tables = [
      makeTable({ id: "table-1", name: "Table A", layoutId: "layout-1" }),
      makeTable({ id: "table-3", name: "Garden Table", layoutId: "layout-2" }),
    ];
    fixture.areas = [];

    renderLayoutEditor(fixture);

    // Room 1 (auto-selected) shows Table A, not Garden Table.
    expect(screen.getByText("Table A")).toBeInTheDocument();
    expect(screen.queryByText("Garden Table")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Garden Room"));

    expect(screen.getByText("Garden Table")).toBeInTheDocument();
    expect(screen.queryByText("Table A")).not.toBeInTheDocument();
  });

  it("add-table modal derives capacity from the selected type", () => {
    const fixture = realisticFixture();
    fixture.tableTypes = [makeTableType({ id: "tt-1", name: "Round 8", capacity: 8 })];
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_add_table" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("admin_add_table")).toBeInTheDocument();

    const saveButton = within(dialog).getByRole("button", { name: "admin_save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("admin_table_name"), {
      target: { value: "New Table" },
    });
    fireEvent.change(within(dialog).getByLabelText("admin_table_type_select"), {
      target: { value: "tt-1" },
    });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    expect(callbacks.onAddTable).toHaveBeenCalledWith("New Table", "layout-1", "tt-1");
  });

  it("add-table modal: filters the table type select to the active room's venue", () => {
    const fixture = realisticFixture();
    fixture.tableTypes = [
      makeTableType({ id: "tt-1", name: "Round 8" }),
      makeTableType({ id: "tt-2", name: "Other Venue Type", venueId: "venue-2" }),
    ];
    renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_add_table" }));

    const dialog = screen.getByRole("dialog");
    const select = within(dialog).getByLabelText("admin_table_type_select") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain("tt-1");
    expect(optionValues).not.toContain("tt-2");
  });

  it("selected-table detail: filters the change-type select to the active room's venue", () => {
    const fixture = realisticFixture();
    fixture.tableTypes = [
      makeTableType({ id: "tt-1", name: "Round 8" }),
      makeTableType({ id: "tt-2", name: "Other Venue Type", venueId: "venue-2" }),
    ];
    renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_table_label Table A" }));

    const select = screen.getByLabelText("admin_layout_table_type_label") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain("tt-1");
    expect(optionValues).not.toContain("tt-2");
  });

  it("add-area modal: Save disabled until label filled, then calls onAddArea", () => {
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    // Add-area button only shows on the "areas" layer.
    fireEvent.click(screen.getByRole("button", { name: "admin_layout_areas" }));
    fireEvent.click(screen.getByRole("button", { name: "admin_layout_add_area" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("admin_layout_add_area")).toBeInTheDocument();

    const saveButton = within(dialog).getByRole("button", { name: "admin_save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("admin_layout_area_form_label"), {
      target: { value: "New Area" },
    });

    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    expect(callbacks.onAddArea).toHaveBeenCalledWith(
      "New Area",
      "bi-shop",
      "layout-1",
      1.5,
      1.0,
      undefined,
    );
  });

  it("deletes a table only after the confirm dialog is accepted", async () => {
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_table_label Table A" }));

    const detailHeading = screen.getByText("admin_table_label: Table A");
    const card = detailHeading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "admin_delete" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("admin_layout_table_delete_confirm")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(callbacks.onDeleteTable).toHaveBeenCalledWith("table-1"));
  });

  it("does not delete a table when the confirm dialog is cancelled", async () => {
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_table_label Table A" }));

    const detailHeading = screen.getByText("admin_table_label: Table A");
    const card = detailHeading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "admin_delete" }));

    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "admin_action_cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(callbacks.onDeleteTable).not.toHaveBeenCalled();
  });

  it("deletes an area only after the confirm dialog is accepted", async () => {
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_layout_areas" }));
    fireEvent.click(screen.getByRole("button", { name: "admin_layout_area_label_prefix Stand 1" }));

    const detailHeading = screen.getByText("admin_layout_area_label_prefix Stand 1");
    const card = detailHeading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "admin_delete" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("admin_layout_area_delete_confirm")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(callbacks.onDeleteArea).toHaveBeenCalledWith("area-1"));
  });

  it("does not delete an area when the confirm dialog is cancelled", async () => {
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_layout_areas" }));
    fireEvent.click(screen.getByRole("button", { name: "admin_layout_area_label_prefix Stand 1" }));

    const detailHeading = screen.getByText("admin_layout_area_label_prefix Stand 1");
    const card = detailHeading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "admin_delete" }));

    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "admin_action_cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(callbacks.onDeleteArea).not.toHaveBeenCalled();
  });

  it("deletes a layout only after the confirm dialog is accepted", async () => {
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_delete" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("admin_layout_delete_confirm")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(callbacks.onDeleteLayout).toHaveBeenCalledWith("layout-1"));
  });

  it("does not delete a layout when the confirm dialog is cancelled", async () => {
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_delete" }));

    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "admin_action_cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(callbacks.onDeleteLayout).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const fixture = realisticFixture();
    const { container } = renderLayoutEditor(fixture);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  describe("layout revisions (#1021)", () => {
    it("opens the revisions modal, lists revisions, and saves a new one", async () => {
      fetchLayoutRevisions.mockResolvedValue([]);
      const fixture = realisticFixture();
      const { callbacks } = renderLayoutEditor(fixture);

      fireEvent.click(screen.getByRole("button", { name: "admin_layout_revisions_button" }));

      const dialog = within(await screen.findByRole("dialog"));
      expect(await dialog.findByText("admin_layout_revisions_empty")).toBeInTheDocument();
      expect(fetchLayoutRevisions).toHaveBeenCalledWith(expect.any(Function), "layout-1");

      fireEvent.change(dialog.getByPlaceholderText("admin_layout_revisions_label_placeholder"), {
        target: { value: "Opening night" },
      });
      fireEvent.click(dialog.getByRole("button", { name: "admin_layout_revisions_save" }));

      await waitFor(() =>
        expect(callbacks.onSaveRevision).toHaveBeenCalledWith(
          "layout-1",
          "Opening night",
          undefined,
        ),
      );
    });

    it("lists saved revisions and compares one against the current draft", async () => {
      const revisionA = {
        id: "layrev-1",
        layoutId: "layout-1",
        revisionNumber: 1,
        label: "Opening",
        changeNote: null,
        createdBy: "admin-a",
        createdAt: "2026-01-01T00:00:00Z",
        snapshot: { tables: [], areas: [], room: { widthM: 10, lengthM: 8 } },
      };
      fetchLayoutRevisions.mockResolvedValue([revisionA]);
      compareLayoutRevisions.mockResolvedValue({
        layoutId: "layout-1",
        fromRef: "1",
        toRef: "current",
        addedTables: [
          {
            id: "table-2",
            name: "Table B",
            x: 40,
            y: 40,
            rotation: 0,
            tableTypeId: "tt-1",
            tableTypeName: "Round 8",
            capacity: 6,
            widthM: 1.5,
            lengthM: 1.5,
          },
        ],
        removedTables: [],
        changedTables: [],
        addedAreas: [],
        removedAreas: [],
        changedAreas: [],
      });

      const fixture = realisticFixture();
      renderLayoutEditor(fixture);
      fireEvent.click(screen.getByRole("button", { name: "admin_layout_revisions_button" }));
      const dialog = within(await screen.findByRole("dialog"));

      await waitFor(() =>
        expect(
          dialog.getByRole("combobox", { name: "admin_layout_revisions_compare_from" }),
        ).toBeInTheDocument(),
      );

      fireEvent.change(
        dialog.getByRole("combobox", { name: "admin_layout_revisions_compare_from" }),
        {
          target: { value: "1" },
        },
      );

      await waitFor(() =>
        expect(compareLayoutRevisions).toHaveBeenCalledWith(
          expect.any(Function),
          "layout-1",
          "1",
          "current",
        ),
      );
      expect(await dialog.findByText("Table B")).toBeInTheDocument();
    });

    it("blocks restoring a revision with live allocation conflicts until the override is checked", async () => {
      const revisionA = {
        id: "layrev-1",
        layoutId: "layout-1",
        revisionNumber: 1,
        label: "Empty",
        changeNote: null,
        createdBy: "admin-a",
        createdAt: "2026-01-01T00:00:00Z",
        snapshot: { tables: [], areas: [], room: { widthM: 10, lengthM: 8 } },
      };
      fetchLayoutRevisions.mockResolvedValue([revisionA]);
      previewLayoutRestore.mockResolvedValue({
        layoutId: "layout-1",
        revisionNumber: 1,
        tablesToAdd: [],
        tablesToUpdate: [],
        tablesToRemove: [
          {
            id: "table-1",
            name: "Table A",
            x: 10,
            y: 10,
            rotation: 0,
            tableTypeId: "tt-1",
            tableTypeName: "Round 8",
            capacity: 8,
            widthM: 1.5,
            lengthM: 1.5,
          },
        ],
        areasToAdd: [],
        areasToUpdate: [],
        areasToRemove: [],
        allocationConflicts: [
          {
            kind: "table",
            id: "table-1",
            name: "Table A",
            reason: "deleted",
            registrationIds: ["reg-1"],
            exhibitorId: null,
          },
        ],
        hasConflicts: true,
      });

      const fixture = realisticFixture();
      const { callbacks } = renderLayoutEditor(fixture);
      fireEvent.click(screen.getByRole("button", { name: "admin_layout_revisions_button" }));
      const dialog = within(await screen.findByRole("dialog"));
      const restoreButton = await dialog.findByRole("button", {
        name: "admin_layout_revisions_restore",
      });

      fireEvent.click(restoreButton);

      await waitFor(() =>
        expect(previewLayoutRestore).toHaveBeenCalledWith(expect.any(Function), "layout-1", 1),
      );
      expect(
        await dialog.findByText("admin_layout_revisions_restore_conflicts_title"),
      ).toBeInTheDocument();

      const confirmButton = dialog.getByRole("button", {
        name: "admin_layout_revisions_restore_confirm",
      });
      expect(confirmButton).toBeDisabled();

      fireEvent.click(
        dialog.getByRole("checkbox", { name: "admin_layout_revisions_restore_override_checkbox" }),
      );
      expect(confirmButton).not.toBeDisabled();

      fireEvent.click(confirmButton);
      await waitFor(() =>
        expect(callbacks.onRestoreRevision).toHaveBeenCalledWith("layout-1", 1, true),
      );
    });
  });
});

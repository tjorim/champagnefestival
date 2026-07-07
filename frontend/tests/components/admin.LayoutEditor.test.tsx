import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LayoutEditor from "@/components/admin/LayoutEditor";
import type { FloorArea, FloorTable, Layout, Room, TableType } from "@/types/admin";
import type { Registration } from "@/types/registration";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
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
    shape: "round",
    widthM: 1.5,
    lengthM: 1.5,
    heightType: "low",
    maxCapacity: 8,
    active: true,
    ...overrides,
  };
}

function makeLayout(overrides: Partial<Layout> = {}): Layout {
  return {
    id: "layout-1",
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
    preOrders: [],
    notes: "",
    accessibilityNote: "",
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
  dayOptions?: { date: string; label: string }[];
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
    "dayOptions" | "tables" | "tableTypes" | "layouts" | "registrations" | "rooms" | "exhibitors" | "areas"
  >
> {
  return {
    dayOptions: [
      { date: "2026-08-01", label: "Saturday" },
      { date: "2026-08-02", label: "Sunday" },
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

describe("LayoutEditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it("add-table modal: Save disabled until valid, then calls onAddTable with expected args", () => {
    const fixture = realisticFixture();
    fixture.tableTypes = [makeTableType({ id: "tt-1", name: "Round 8", maxCapacity: 8 })];
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
    fireEvent.change(within(dialog).getByLabelText("admin_table_capacity"), {
      target: { value: "6" },
    });

    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    expect(callbacks.onAddTable).toHaveBeenCalledWith("New Table", 6, "layout-1", "tt-1");
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

    expect(callbacks.onAddArea).toHaveBeenCalledWith("New Area", "bi-shop", "layout-1", 1.5, 1.0, undefined);
  });

  it("deletes a table only after confirm() returns true", () => {
    const confirmMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_table_label Table A" }));

    const detailHeading = screen.getByText("admin_table_label: Table A");
    const card = detailHeading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "admin_delete" }));

    expect(confirmMock).toHaveBeenCalledWith("admin_layout_table_delete_confirm");
    expect(callbacks.onDeleteTable).toHaveBeenCalledWith("table-1");
  });

  it("does not delete a table when confirm() returns false", () => {
    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmMock);
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_table_label Table A" }));

    const detailHeading = screen.getByText("admin_table_label: Table A");
    const card = detailHeading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "admin_delete" }));

    expect(confirmMock).toHaveBeenCalledWith("admin_layout_table_delete_confirm");
    expect(callbacks.onDeleteTable).not.toHaveBeenCalled();
  });

  it("deletes an area only after confirm() returns true", () => {
    const confirmMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_layout_areas" }));
    fireEvent.click(screen.getByRole("button", { name: "admin_layout_area_label_prefix Stand 1" }));

    const detailHeading = screen.getByText("admin_layout_area_label_prefix Stand 1");
    const card = detailHeading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "admin_delete" }));

    expect(confirmMock).toHaveBeenCalledWith("admin_layout_area_delete_confirm");
    expect(callbacks.onDeleteArea).toHaveBeenCalledWith("area-1");
  });

  it("does not delete an area when confirm() returns false", () => {
    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmMock);
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_layout_areas" }));
    fireEvent.click(screen.getByRole("button", { name: "admin_layout_area_label_prefix Stand 1" }));

    const detailHeading = screen.getByText("admin_layout_area_label_prefix Stand 1");
    const card = detailHeading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "admin_delete" }));

    expect(confirmMock).toHaveBeenCalledWith("admin_layout_area_delete_confirm");
    expect(callbacks.onDeleteArea).not.toHaveBeenCalled();
  });

  it("deletes a layout only after confirm() returns true", () => {
    const confirmMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_delete" }));

    expect(confirmMock).toHaveBeenCalledWith("admin_layout_delete_confirm");
    expect(callbacks.onDeleteLayout).toHaveBeenCalledWith("layout-1");
  });

  it("does not delete a layout when confirm() returns false", () => {
    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmMock);
    const fixture = realisticFixture();
    const { callbacks } = renderLayoutEditor(fixture);

    fireEvent.click(screen.getByRole("button", { name: "admin_delete" }));

    expect(confirmMock).toHaveBeenCalledWith("admin_layout_delete_confirm");
    expect(callbacks.onDeleteLayout).not.toHaveBeenCalled();
  });
});

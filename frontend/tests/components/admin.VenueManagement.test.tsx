import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import VenueManagement from "@/components/admin/VenueManagement";
import type { FloorTable, Layout, Room, TableType, Venue } from "@/types/admin";

// happy-dom does not implement window.confirm, so it must be stubbed rather
// than wrapped (vi.spyOn requires an existing function).
function mockConfirm(returnValue: boolean) {
  const fn = vi.fn().mockReturnValue(returnValue);
  vi.stubGlobal("confirm", fn);
  return fn;
}

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const activeVenue: Venue = {
  id: "venue-1",
  name: "Grand Hall",
  address: "1 Main St",
  city: "Ghent",
  postalCode: "9000",
  country: "BE",
  lat: 51.05,
  lng: 3.72,
  active: true,
};

const archivedVenue: Venue = {
  id: "venue-2",
  name: "Old Barn",
  address: "2 Side St",
  city: "Bruges",
  postalCode: "8000",
  country: "BE",
  lat: 51.21,
  lng: 3.22,
  active: false,
};

const room1: Room = {
  id: "room-1",
  venueId: "venue-1",
  name: "Room A",
  widthM: 20,
  lengthM: 15,
  color: "#ffc107",
  active: true,
  dimensionsPlaceholder: false,
};

const room2: Room = {
  id: "room-2",
  venueId: "venue-1",
  name: "Room B",
  widthM: 10,
  lengthM: 10,
  color: "#123456",
  active: false,
  dimensionsPlaceholder: false,
};

const activeTableType: TableType = {
  id: "tt-1",
  name: "Standard Rectangle",
  venueId: "venue-1",
  shape: "rectangle",
  widthM: 0.7,
  lengthM: 1.8,
  heightType: "low",
  maxCapacity: 4,
  active: true,
};

const archivedTableType: TableType = {
  id: "tt-2",
  name: "Retired Round",
  venueId: "venue-1",
  shape: "round",
  widthM: 0.9,
  lengthM: 0.9,
  heightType: "high",
  maxCapacity: 2,
  active: false,
};

const layout1: Layout = {
  id: "layout-1",
  editionId: "edition-1",
  roomId: "room-1",
  date: "2026-08-01",
  label: "",
  createdAt: "2026-01-01T00:00:00Z",
};

const tableUsingActiveType: FloorTable = {
  id: "table-1",
  name: "Table A",
  capacity: 4,
  x: 10,
  y: 10,
  tableTypeId: "tt-1",
  rotation: 0,
  layoutId: "layout-1",
  registrationIds: [],
};

interface RenderOverrides {
  venues?: Venue[];
  rooms?: Room[];
  tableTypes?: TableType[];
  tables?: FloorTable[];
  layouts?: Layout[];
  onAdd?: (...args: unknown[]) => Promise<void>;
  onArchive?: (...args: unknown[]) => Promise<void>;
  onRestore?: (...args: unknown[]) => Promise<void>;
  onDelete?: (...args: unknown[]) => Promise<void>;
  onAddRoom?: (...args: unknown[]) => Promise<void>;
  onUpdateRoom?: (...args: unknown[]) => Promise<void>;
  onArchiveRoom?: (...args: unknown[]) => Promise<void>;
  onRestoreRoom?: (...args: unknown[]) => Promise<void>;
  onDeleteRoom?: (...args: unknown[]) => Promise<void>;
  onAddTableType?: (data: Omit<TableType, "id">) => Promise<void>;
  onUpdateTableType?: (id: string, data: Partial<Omit<TableType, "id">>) => Promise<void>;
  onArchiveTableType?: (id: string) => Promise<void>;
  onRestoreTableType?: (id: string) => Promise<void>;
  onDeleteTableType?: (id: string) => Promise<void>;
}

function renderVenueManagement(overrides: RenderOverrides = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(undefined);
  const onArchive = overrides.onArchive ?? vi.fn().mockResolvedValue(undefined);
  const onRestore = overrides.onRestore ?? vi.fn().mockResolvedValue(undefined);
  const onDelete = overrides.onDelete ?? vi.fn().mockResolvedValue(undefined);
  const onAddRoom = overrides.onAddRoom ?? vi.fn().mockResolvedValue(undefined);
  const onUpdateRoom = overrides.onUpdateRoom ?? vi.fn().mockResolvedValue(undefined);
  const onArchiveRoom = overrides.onArchiveRoom ?? vi.fn().mockResolvedValue(undefined);
  const onRestoreRoom = overrides.onRestoreRoom ?? vi.fn().mockResolvedValue(undefined);
  const onDeleteRoom = overrides.onDeleteRoom ?? vi.fn().mockResolvedValue(undefined);
  const onAddTableType = overrides.onAddTableType ?? vi.fn().mockResolvedValue(undefined);
  const onUpdateTableType = overrides.onUpdateTableType ?? vi.fn().mockResolvedValue(undefined);
  const onArchiveTableType = overrides.onArchiveTableType ?? vi.fn().mockResolvedValue(undefined);
  const onRestoreTableType = overrides.onRestoreTableType ?? vi.fn().mockResolvedValue(undefined);
  const onDeleteTableType = overrides.onDeleteTableType ?? vi.fn().mockResolvedValue(undefined);

  render(
    <VenueManagement
      venues={overrides.venues ?? [activeVenue, archivedVenue]}
      rooms={overrides.rooms ?? [room1, room2]}
      tableTypes={overrides.tableTypes ?? [activeTableType, archivedTableType]}
      tables={overrides.tables ?? [tableUsingActiveType]}
      layouts={overrides.layouts ?? [layout1]}
      onAdd={onAdd}
      onArchive={onArchive}
      onRestore={onRestore}
      onDelete={onDelete}
      onAddRoom={onAddRoom}
      onUpdateRoom={onUpdateRoom}
      onArchiveRoom={onArchiveRoom}
      onRestoreRoom={onRestoreRoom}
      onDeleteRoom={onDeleteRoom}
      onAddTableType={onAddTableType}
      onUpdateTableType={onUpdateTableType}
      onArchiveTableType={onArchiveTableType}
      onRestoreTableType={onRestoreTableType}
      onDeleteTableType={onDeleteTableType}
    />,
  );

  return {
    onAdd,
    onArchive,
    onRestore,
    onDelete,
    onAddRoom,
    onUpdateRoom,
    onArchiveRoom,
    onRestoreRoom,
    onDeleteRoom,
    onAddTableType,
    onUpdateTableType,
    onArchiveTableType,
    onRestoreTableType,
    onDeleteTableType,
  };
}

/** Each venue renders as its own nested `.card`; scope to it via a name inside it. */
function venueCard(name: string): HTMLElement {
  return screen.getByText(name).closest(".card") as HTMLElement;
}

/** Venue-level actions (Archive/Restore/Delete) live in that card's header, not its
 * body — scoping here avoids ambiguity with the same-labelled room/table-type actions
 * inside the body's list groups. */
function venueCardHeader(name: string): HTMLElement {
  return screen.getByText(name).closest(".card-header") as HTMLElement;
}

/** Room and table-type rows are `ListGroup.Item`s; scope to the specific row via its name. */
function listItem(name: string): HTMLElement {
  return screen.getByText(name).closest(".list-group-item") as HTMLElement;
}

describe("VenueManagement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a venue card with its location line, room list, and an archived badge on inactive venues", () => {
    renderVenueManagement();

    const activeScope = within(venueCard("Grand Hall"));
    expect(activeScope.getByText("1 Main St, Ghent, 9000, BE")).toBeInTheDocument();
    expect(activeScope.getByText("Room A")).toBeInTheDocument();
    expect(activeScope.getByText("Room B")).toBeInTheDocument();

    expect(within(venueCard("Old Barn")).getByText("admin_venue_archived_badge")).toBeInTheDocument();
  });

  it("hides the rooms/table-types body for an archived venue", () => {
    renderVenueManagement();

    const archivedScope = within(venueCard("Old Barn"));
    expect(archivedScope.queryByText("admin_rooms_tab")).not.toBeInTheDocument();
    expect(archivedScope.queryByText("admin_table_types_tab")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no venues", () => {
    renderVenueManagement({ venues: [], rooms: [], tableTypes: [] });
    expect(screen.getByText("admin_no_venues")).toBeInTheDocument();
  });

  it("disables Save until name is filled, then calls onAdd with trimmed args and closes the modal", async () => {
    const { onAdd } = renderVenueManagement({ venues: [], rooms: [], tableTypes: [] });

    fireEvent.click(screen.getByRole("button", { name: "admin_venue_add" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    const saveButton = dialogScope.getByRole("button", { name: "admin_save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(dialogScope.getByLabelText("admin_venue_name_label"), {
      target: { value: "  New Venue  " },
    });
    fireEvent.change(dialogScope.getByLabelText("admin_venue_city_label"), {
      target: { value: "  Antwerp  " },
    });

    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    expect(onAdd).toHaveBeenCalledWith("New Venue", "", "Antwerp", "", "");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not call onArchive when the confirm dialog is cancelled", () => {
    const confirmFn = mockConfirm(false);
    const { onArchive } = renderVenueManagement();

    fireEvent.click(
      within(venueCardHeader("Grand Hall")).getByRole("button", { name: "admin_content_archive" }),
    );

    expect(confirmFn).toHaveBeenCalledWith("admin_venue_archive_confirm");
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("calls onArchive with the venue id when the confirm dialog is accepted", () => {
    mockConfirm(true);
    const { onArchive } = renderVenueManagement();

    fireEvent.click(
      within(venueCardHeader("Grand Hall")).getByRole("button", { name: "admin_content_archive" }),
    );

    expect(onArchive).toHaveBeenCalledWith("venue-1");
  });

  it("does not call onDelete when the confirm dialog is cancelled", () => {
    const confirmFn = mockConfirm(false);
    const { onDelete } = renderVenueManagement();

    fireEvent.click(within(venueCardHeader("Old Barn")).getByRole("button", { name: "admin_delete" }));

    expect(confirmFn).toHaveBeenCalledWith("admin_venue_delete_confirm");
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("calls onDelete with the venue id when the confirm dialog is accepted", () => {
    mockConfirm(true);
    const { onDelete } = renderVenueManagement();

    fireEvent.click(within(venueCardHeader("Old Barn")).getByRole("button", { name: "admin_delete" }));

    expect(onDelete).toHaveBeenCalledWith("venue-2");
  });

  it("calls onRestore immediately with no confirm prompt", () => {
    const confirmSpy = vi.fn();
    vi.stubGlobal("confirm", confirmSpy);
    const { onRestore } = renderVenueManagement();

    fireEvent.click(
      within(venueCardHeader("Old Barn")).getByRole("button", { name: "admin_content_restore" }),
    );

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onRestore).toHaveBeenCalledWith("venue-2");
  });

  it("opens the add-room modal and calls onAddRoom with the expected args", async () => {
    const { onAddRoom } = renderVenueManagement();

    fireEvent.click(screen.getByRole("button", { name: "admin_room_add" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);

    fireEvent.change(dialogScope.getByLabelText("admin_room_name_label"), {
      target: { value: "New Room" },
    });
    fireEvent.change(dialogScope.getByLabelText("admin_room_width_label"), {
      target: { value: "12" },
    });
    fireEvent.change(dialogScope.getByLabelText("admin_room_length_label"), {
      target: { value: "8" },
    });

    fireEvent.click(dialogScope.getByRole("button", { name: "admin_save" }));

    expect(onAddRoom).toHaveBeenCalledWith("venue-1", "New Room", 12, 8, "#ffc107");
  });

  it("deletes an archived room and surfaces the API's refusal", async () => {
    // DELETE /api/rooms/{id} 409s while layouts still reference the room, so a
    // failed delete has to explain itself rather than look inert.
    const onDeleteRoom = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cannot delete: layouts are still using this room."))
      .mockResolvedValueOnce(undefined);
    renderVenueManagement({ onDeleteRoom });

    const deleteButton = screen.getByRole("button", { name: /admin_delete Room B/ });

    fireEvent.click(deleteButton);
    expect(
      await screen.findByText("Cannot delete: layouts are still using this room."),
    ).toBeInTheDocument();

    fireEvent.click(deleteButton);
    await waitFor(() => expect(onDeleteRoom).toHaveBeenCalledTimes(2));
    expect(onDeleteRoom).toHaveBeenLastCalledWith("room-2");
  });

  it("opens the edit-room modal prefilled, and calls onUpdateRoom with the edited fields", async () => {
    const { onUpdateRoom } = renderVenueManagement();

    fireEvent.click(within(listItem("Room A")).getByRole("button", { name: "admin_edit" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    expect(dialogScope.getByText("admin_edit_room")).toBeInTheDocument();
    expect(dialogScope.getByLabelText("admin_room_name_label")).toHaveValue("Room A");
    expect(dialogScope.getByLabelText("admin_room_width_label")).toHaveValue(20);
    expect(dialogScope.getByLabelText("admin_room_length_label")).toHaveValue(15);

    fireEvent.change(dialogScope.getByLabelText("admin_room_name_label"), {
      target: { value: "Room A (renamed)" },
    });
    fireEvent.change(dialogScope.getByLabelText("admin_room_width_label"), {
      target: { value: "22" },
    });

    fireEvent.click(dialogScope.getByRole("button", { name: "admin_save" }));

    expect(onUpdateRoom).toHaveBeenCalledWith("room-1", {
      venueId: "venue-1",
      name: "Room A (renamed)",
      widthM: 22,
      lengthM: 15,
      color: "#ffc107",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("omits width/length from onUpdateRoom when an edit doesn't touch dimensions, preserving dimensionsPlaceholder", async () => {
    const { onUpdateRoom } = renderVenueManagement({
      rooms: [{ ...room1, dimensionsPlaceholder: true }, room2],
    });

    fireEvent.click(within(listItem("Room A")).getByRole("button", { name: "admin_edit" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    fireEvent.change(dialogScope.getByLabelText("admin_room_name_label"), {
      target: { value: "Room A (renamed)" },
    });

    fireEvent.click(dialogScope.getByRole("button", { name: "admin_save" }));

    expect(onUpdateRoom).toHaveBeenCalledWith("room-1", {
      venueId: "venue-1",
      name: "Room A (renamed)",
      color: "#ffc107",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a placeholder-dimensions indicator for rooms with unconfirmed dimensions", () => {
    renderVenueManagement({
      rooms: [{ ...room1, dimensionsPlaceholder: true }, room2],
    });

    expect(
      screen.getByLabelText("admin_room_dimensions_placeholder_badge"),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Table types (nested under each venue, #858)
  // ---------------------------------------------------------------------------

  it("renders table type rows within the venue card, with the archived one dimmed", () => {
    renderVenueManagement();

    const activeScope = within(venueCard("Grand Hall"));
    expect(activeScope.getByText("Standard Rectangle")).toBeInTheDocument();
    expect(activeScope.getByText("Retired Round")).toBeInTheDocument();

    expect(listItem("Retired Round").className).toContain("opacity-50");
  });

  it("disables Save until name/venue/dimensions are valid, then calls onAddTableType prefilled with the clicked venue", async () => {
    const { onAddTableType } = renderVenueManagement({ tableTypes: [], tables: [] });

    fireEvent.click(screen.getByRole("button", { name: "admin_add_table_type" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    const saveButton = dialogScope.getByRole("button", { name: "admin_save" });
    expect(saveButton).toBeDisabled();
    expect(dialogScope.getByLabelText("admin_room_venue_label")).toHaveValue("venue-1");

    fireEvent.change(dialogScope.getByLabelText("admin_table_name"), {
      target: { value: "Banquet Rect" },
    });
    expect(saveButton).toBeDisabled();

    fireEvent.change(dialogScope.getByLabelText("admin_table_width_label"), {
      target: { value: "0.8" },
    });
    fireEvent.change(dialogScope.getByLabelText("admin_table_length_label"), {
      target: { value: "2" },
    });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    expect(onAddTableType).toHaveBeenCalledWith({
      venueId: "venue-1",
      name: "Banquet Rect",
      shape: "rectangle",
      widthM: 0.8,
      lengthM: 2,
      heightType: "low",
      maxCapacity: 4,
      active: true,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("switching the shape select to round updates default dimensions and swaps the width/length fields for a single diameter field", async () => {
    renderVenueManagement({ tableTypes: [], tables: [] });

    fireEvent.click(screen.getByRole("button", { name: "admin_add_table_type" }));
    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);

    expect(dialogScope.queryByLabelText("admin_table_diameter_label")).not.toBeInTheDocument();
    fireEvent.change(dialogScope.getByLabelText("admin_table_shape_label"), {
      target: { value: "round" },
    });

    expect(dialogScope.queryByLabelText("admin_table_width_label")).not.toBeInTheDocument();
    const diameterField = dialogScope.getByLabelText("admin_table_diameter_label") as HTMLInputElement;
    expect(diameterField.value).toBe("0.9");
  });

  it("pre-fills the edit form from the row's existing values and calls onUpdateTableType without the active field", async () => {
    const { onUpdateTableType } = renderVenueManagement({ tables: [] });

    fireEvent.click(within(listItem("Standard Rectangle")).getByRole("button", { name: "admin_edit" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    const nameInput = dialogScope.getByLabelText("admin_table_name") as HTMLInputElement;
    expect(nameInput.value).toBe("Standard Rectangle");

    fireEvent.change(nameInput, { target: { value: "Renamed Rectangle" } });
    fireEvent.click(dialogScope.getByRole("button", { name: "admin_save" }));

    expect(onUpdateTableType).toHaveBeenCalledWith("tt-1", {
      venueId: "venue-1",
      name: "Renamed Rectangle",
      shape: "rectangle",
      widthM: 0.7,
      lengthM: 1.8,
      heightType: "low",
      maxCapacity: 4,
    });
    const callArgs = vi.mocked(onUpdateTableType).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("active");
  });

  it("confirms the affected table/room count before saving a dimension change on an in-use type, and proceeds when accepted", async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);
    const { onUpdateTableType } = renderVenueManagement();

    fireEvent.click(within(listItem("Standard Rectangle")).getByRole("button", { name: "admin_edit" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    fireEvent.change(dialogScope.getByLabelText("admin_table_width_label"), {
      target: { value: "0.9" },
    });
    fireEvent.click(dialogScope.getByRole("button", { name: "admin_save" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'admin_table_type_dimension_change_confirm({"tableCount":1,"roomCount":1})',
    );
    await waitFor(() => expect(onUpdateTableType).toHaveBeenCalled());
  });

  it("cancels the save when the dimension-change confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const { onUpdateTableType } = renderVenueManagement();

    fireEvent.click(within(listItem("Standard Rectangle")).getByRole("button", { name: "admin_edit" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    fireEvent.change(dialogScope.getByLabelText("admin_table_width_label"), {
      target: { value: "0.9" },
    });
    fireEvent.click(dialogScope.getByRole("button", { name: "admin_save" }));

    expect(onUpdateTableType).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("saves a dimension change without confirmation when no tables use the type", async () => {
    const confirmSpy = vi.fn();
    vi.stubGlobal("confirm", confirmSpy);
    const { onUpdateTableType } = renderVenueManagement({ tables: [] });

    fireEvent.click(within(listItem("Standard Rectangle")).getByRole("button", { name: "admin_edit" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    fireEvent.change(dialogScope.getByLabelText("admin_table_width_label"), {
      target: { value: "0.9" },
    });
    fireEvent.click(dialogScope.getByRole("button", { name: "admin_save" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(onUpdateTableType).toHaveBeenCalled());
  });

  it("archives an active table type immediately, with no confirm prompt", () => {
    const confirmSpy = vi.fn();
    vi.stubGlobal("confirm", confirmSpy);
    const { onArchiveTableType } = renderVenueManagement();

    fireEvent.click(
      within(listItem("Standard Rectangle")).getByRole("button", { name: "admin_content_archive" }),
    );

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onArchiveTableType).toHaveBeenCalledWith("tt-1");
  });

  it("restores an archived table type immediately, with no confirm prompt, and hides the edit button on archived rows", () => {
    const confirmSpy = vi.fn();
    vi.stubGlobal("confirm", confirmSpy);
    const { onRestoreTableType } = renderVenueManagement();

    const row = listItem("Retired Round");
    expect(within(row).queryByRole("button", { name: "admin_edit" })).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "admin_content_restore" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onRestoreTableType).toHaveBeenCalledWith("tt-2");
  });

  it("offers delete on archived table types only, and asks for confirmation first", () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);
    const { onDeleteTableType } = renderVenueManagement();

    expect(
      within(listItem("Standard Rectangle")).queryByRole("button", { name: /admin_delete/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(listItem("Retired Round")).getByRole("button", { name: "admin_delete Retired Round" }),
    );

    expect(confirmSpy).toHaveBeenCalledWith("admin_table_type_delete_confirm");
    expect(onDeleteTableType).toHaveBeenCalledWith("tt-2");
  });

  it("surfaces the API's refusal when tables still use the table type", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const onDeleteTableType = vi
      .fn()
      .mockRejectedValue(new Error("Cannot delete: tables are still using this type."));
    renderVenueManagement({ onDeleteTableType });

    fireEvent.click(
      within(listItem("Retired Round")).getByRole("button", { name: "admin_delete Retired Round" }),
    );

    expect(
      await screen.findByText("Cannot delete: tables are still using this type."),
    ).toBeInTheDocument();
  });
});

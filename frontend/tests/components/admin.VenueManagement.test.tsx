import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import VenueManagement from "@/components/admin/VenueManagement";
import type { Room, Venue } from "@/types/admin";

// happy-dom does not implement window.confirm, so it must be stubbed with a
// plain assignment (vi.spyOn requires an existing function to wrap).
function mockConfirm(returnValue: boolean) {
  const fn = vi.fn().mockReturnValue(returnValue);
  window.confirm = fn;
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
};

const room2: Room = {
  id: "room-2",
  venueId: "venue-1",
  name: "Room B",
  widthM: 10,
  lengthM: 10,
  color: "#123456",
  active: false,
};

interface RenderOverrides {
  venues?: Venue[];
  rooms?: Room[];
  onAdd?: (...args: unknown[]) => Promise<void>;
  onArchive?: (...args: unknown[]) => Promise<void>;
  onRestore?: (...args: unknown[]) => Promise<void>;
  onDelete?: (...args: unknown[]) => Promise<void>;
  onAddRoom?: (...args: unknown[]) => Promise<void>;
  onArchiveRoom?: (...args: unknown[]) => Promise<void>;
  onRestoreRoom?: (...args: unknown[]) => Promise<void>;
}

function renderVenueManagement(overrides: RenderOverrides = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(undefined);
  const onArchive = overrides.onArchive ?? vi.fn().mockResolvedValue(undefined);
  const onRestore = overrides.onRestore ?? vi.fn().mockResolvedValue(undefined);
  const onDelete = overrides.onDelete ?? vi.fn().mockResolvedValue(undefined);
  const onAddRoom = overrides.onAddRoom ?? vi.fn().mockResolvedValue(undefined);
  const onArchiveRoom = overrides.onArchiveRoom ?? vi.fn().mockResolvedValue(undefined);
  const onRestoreRoom = overrides.onRestoreRoom ?? vi.fn().mockResolvedValue(undefined);

  render(
    <VenueManagement
      venues={overrides.venues ?? [activeVenue, archivedVenue]}
      rooms={overrides.rooms ?? [room1, room2]}
      onAdd={onAdd}
      onArchive={onArchive}
      onRestore={onRestore}
      onDelete={onDelete}
      onAddRoom={onAddRoom}
      onArchiveRoom={onArchiveRoom}
      onRestoreRoom={onRestoreRoom}
    />,
  );

  return { onAdd, onArchive, onRestore, onDelete, onAddRoom, onArchiveRoom, onRestoreRoom };
}

describe("VenueManagement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- clean up the manual window.confirm stub between tests
    delete window.confirm;
  });

  it("renders venue rows with address/city/postal/country and room badges", () => {
    renderVenueManagement();

    const activeRow = screen.getByText("Grand Hall").closest("tr");
    expect(activeRow).not.toBeNull();
    const activeRowScope = within(activeRow as HTMLElement);
    expect(activeRowScope.getByText("1 Main St")).toBeInTheDocument();
    expect(activeRowScope.getByText("Ghent")).toBeInTheDocument();
    expect(activeRowScope.getByText("9000")).toBeInTheDocument();
    expect(activeRowScope.getByText("BE")).toBeInTheDocument();
    expect(activeRowScope.getByText("Room A")).toBeInTheDocument();
    expect(activeRowScope.getByText("Room B")).toBeInTheDocument();

    const archivedRow = screen.getByText("Old Barn").closest("tr");
    expect(archivedRow).not.toBeNull();
    expect(within(archivedRow as HTMLElement).getByText("admin_venue_archived_badge")).toBeInTheDocument();
  });

  it("shows the empty state when there are no venues", () => {
    renderVenueManagement({ venues: [], rooms: [] });
    expect(screen.getByText("admin_no_venues")).toBeInTheDocument();
  });

  it("disables Save until name is filled, then calls onAdd with trimmed args and closes the modal", async () => {
    const { onAdd } = renderVenueManagement({ venues: [], rooms: [] });

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

  // Note: the venue row also contains a room "archive" (x) button reusing the
  // same admin_content_archive label (room1 belongs to venue-1 and is active),
  // so the venue-level archive action is disambiguated as the last matching
  // button in the row (the actions column renders after the rooms column).
  it("does not call onArchive when the confirm dialog is cancelled", () => {
    const confirmFn = mockConfirm(false);
    const { onArchive } = renderVenueManagement();

    const activeRow = screen.getByText("Grand Hall").closest("tr") as HTMLElement;
    const archiveButtons = within(activeRow).getAllByRole("button", { name: "admin_content_archive" });
    fireEvent.click(archiveButtons.at(-1) as HTMLElement);

    expect(confirmFn).toHaveBeenCalledWith("admin_venue_archive_confirm");
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("calls onArchive with the venue id when the confirm dialog is accepted", () => {
    mockConfirm(true);
    const { onArchive } = renderVenueManagement();

    const activeRow = screen.getByText("Grand Hall").closest("tr") as HTMLElement;
    const archiveButtons = within(activeRow).getAllByRole("button", { name: "admin_content_archive" });
    fireEvent.click(archiveButtons.at(-1) as HTMLElement);

    expect(onArchive).toHaveBeenCalledWith("venue-1");
  });

  it("does not call onDelete when the confirm dialog is cancelled", () => {
    const confirmFn = mockConfirm(false);
    const { onDelete } = renderVenueManagement();

    const archivedRow = screen.getByText("Old Barn").closest("tr") as HTMLElement;
    fireEvent.click(within(archivedRow).getByRole("button", { name: "admin_delete" }));

    expect(confirmFn).toHaveBeenCalledWith("admin_venue_delete_confirm");
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("calls onDelete with the venue id when the confirm dialog is accepted", () => {
    mockConfirm(true);
    const { onDelete } = renderVenueManagement();

    const archivedRow = screen.getByText("Old Barn").closest("tr") as HTMLElement;
    fireEvent.click(within(archivedRow).getByRole("button", { name: "admin_delete" }));

    expect(onDelete).toHaveBeenCalledWith("venue-2");
  });

  it("calls onRestore immediately with no confirm prompt", () => {
    const confirmSpy = vi.fn();
    window.confirm = confirmSpy;
    const { onRestore } = renderVenueManagement();

    const archivedRow = screen.getByText("Old Barn").closest("tr") as HTMLElement;
    fireEvent.click(within(archivedRow).getByRole("button", { name: "admin_content_restore" }));

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
});

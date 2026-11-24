import {
  auditRecordId,
  focusAuditRecord,
  isAuditRecordTarget,
} from "@/features/admin/shared/auditRecordLink";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminAddButton, RowActionButton, RowActions } from "@/components/admin/RowActions";
import {
  ArchiveIcon,
  CircleIcon,
  PencilIcon,
  RotateCcwIcon,
  SquareIcon,
  TrashIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import type { Room, TableType, Venue } from "@/api-types";
import { safeRoomColor } from "@/lib/venue/layoutUtils";

export interface VenueCardActions {
  openEditVenue: (venue: Venue) => void;
  handleRestoreVenue: (id: string) => void;
  setConfirmArchiveVenueId: (id: string) => void;
  setConfirmDeleteVenueId: (id: string) => void;
  openAddRoom: (venueId: string) => void;
  openEditRoom: (room: Room) => void;
  handleArchiveRoom: (roomId: string) => void;
  handleRestoreRoom: (roomId: string) => void;
  setConfirmDeleteRoomId: (id: string) => void;
  openAddTableType: (venueId: string) => void;
  openEditTableType: (tableType: TableType) => void;
  handleArchiveTableType: (id: string) => void;
  handleRestoreTableType: (id: string) => void;
  setConfirmDeleteTableTypeId: (id: string) => void;
}

interface VenueCardProps {
  venue: Venue;
  rooms: Room[];
  tableTypes: TableType[];
  actions: VenueCardActions;
}

/** One venue with its rooms and table types. */
export function VenueCard({ venue, rooms, tableTypes, actions }: VenueCardProps) {
  const {
    openEditVenue,
    handleRestoreVenue,
    setConfirmArchiveVenueId,
    setConfirmDeleteVenueId,
    openAddRoom,
    openEditRoom,
    handleArchiveRoom,
    handleRestoreRoom,
    setConfirmDeleteRoomId,
    openAddTableType,
    openEditTableType,
    handleArchiveTableType,
    handleRestoreTableType,
    setConfirmDeleteTableTypeId,
  } = actions;
  const number = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 });
  const isArchived = !venue.active;
  const venueRooms = rooms.filter((r) => r.venue_id === venue.id);
  const venueTableTypes = tableTypes.filter((tt) => tt.venue_id === venue.id);
  const showProperties =
    !isArchived ||
    venueRooms.some((room) => isAuditRecordTarget("room", room.id)) ||
    venueTableTypes.some((type) => isAuditRecordTarget("table_type", type.id));
  const locationLine = [venue.address, venue.city, venue.postal_code, venue.country]
    .filter(Boolean)
    .join(", ");
  return (
    <Card
      id={auditRecordId("venue", venue.id)}
      tabIndex={-1}
      ref={focusAuditRecord}
      tone="secondary"
      className={cn(isArchived && "opacity-75")}
    >
      <CardHeader className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">
            {venue.name}
            {isArchived && (
              <Badge variant="secondary" className="ms-2 text-tiny">
                {m.admin_venue_archived_badge()}
              </Badge>
            )}
          </div>
          <div className="text-subtle text-sm">{locationLine || "—"}</div>
        </div>
        <RowActions
          className="shrink-0"
          destructive={
            isArchived ? (
              <RowActionButton
                destructive
                icon={TrashIcon}
                label={m.admin_delete_item({ name: venue.name })}
                onClick={() => setConfirmDeleteVenueId(venue.id)}
              />
            ) : undefined
          }
        >
          <RowActionButton
            icon={PencilIcon}
            label={m.admin_edit_item({ name: venue.name })}
            onClick={() => openEditVenue(venue)}
          />
          {isArchived ? (
            <RowActionButton
              variant="outline-success"
              icon={RotateCcwIcon}
              label={`${m.admin_content_restore()}: ${venue.name}`}
              onClick={() => handleRestoreVenue(venue.id)}
            />
          ) : (
            <RowActionButton
              icon={ArchiveIcon}
              label={`${m.admin_content_archive()}: ${venue.name}`}
              onClick={() => setConfirmArchiveVenueId(venue.id)}
            />
          )}
        </RowActions>
      </CardHeader>
      {showProperties && (
        <CardContent className="py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-subtle text-sm uppercase font-semibold">
              {m.admin_rooms_tab()}
            </span>
            {!isArchived && (
              <AdminAddButton variant="outline" onClick={() => openAddRoom(venue.id)}>
                {m.admin_room_add()}
              </AdminAddButton>
            )}
          </div>
          {venueRooms.length === 0 ? (
            <AdminEmptyState>{m.admin_room_no_rooms()}</AdminEmptyState>
          ) : (
            <PresentationList flush className="mb-4">
              {venueRooms.map((room) => (
                <PresentationListItem
                  key={room.id}
                  id={auditRecordId("room", room.id)}
                  tabIndex={-1}
                  ref={focusAuditRecord}
                  className={cn(
                    "flex justify-between items-center gap-2 py-1 px-0",
                    !room.active && "opacity-50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block size-2.5 rounded-full shrink-0"

                      /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
                      style={{ background: safeRoomColor(room.color) }}
                      /* oxlint-enable shadcn/no-inline-styles */
                    />
                    {room.name}
                    {!room.dimensions_placeholder && (
                      <small className="text-subtle">
                        {m.admin_room_dimensions_summary({
                          width: number.format(room.width_m),
                          length: number.format(room.length_m),
                        })}
                      </small>
                    )}
                    {room.dimensions_placeholder && (
                      <span
                        role="img"
                        aria-label={m.admin_room_dimensions_placeholder_badge()}
                        title={m.admin_room_dimensions_placeholder_hint()}
                      >
                        <Icon icon={TriangleAlertIcon} className="text-xs text-warning" />
                      </span>
                    )}
                  </span>
                  {!isArchived && (
                    <RowActions
                      className="shrink-0"
                      destructive={
                        room.active ? undefined : (
                          <RowActionButton
                            destructive
                            icon={TrashIcon}
                            label={m.admin_delete_item({ name: room.name })}
                            onClick={() => setConfirmDeleteRoomId(room.id)}
                          />
                        )
                      }
                    >
                      {room.active && (
                        <RowActionButton
                          icon={PencilIcon}
                          label={m.admin_edit_item({ name: room.name })}
                          onClick={() => openEditRoom(room)}
                        />
                      )}
                      {room.active ? (
                        <RowActionButton
                          icon={ArchiveIcon}
                          label={`${m.admin_content_archive()}: ${room.name}`}
                          onClick={() => handleArchiveRoom(room.id)}
                        />
                      ) : (
                        <RowActionButton
                          variant="outline-success"
                          icon={RotateCcwIcon}
                          label={`${m.admin_content_restore()}: ${room.name}`}
                          onClick={() => handleRestoreRoom(room.id)}
                        />
                      )}
                    </RowActions>
                  )}
                </PresentationListItem>
              ))}
            </PresentationList>
          )}

          <div className="flex items-center justify-between mb-1">
            <span className="text-subtle text-sm uppercase font-semibold">
              {m.admin_table_types_tab()}
            </span>
            {!isArchived && (
              <AdminAddButton variant="outline" onClick={() => openAddTableType(venue.id)}>
                {m.admin_add_table_type()}
              </AdminAddButton>
            )}
          </div>
          {venueTableTypes.length === 0 ? (
            <AdminEmptyState>{m.admin_no_table_types()}</AdminEmptyState>
          ) : (
            <PresentationList flush className="mb-0">
              {venueTableTypes.map((tt) => (
                <PresentationListItem
                  key={tt.id}
                  id={auditRecordId("table_type", tt.id)}
                  tabIndex={-1}
                  ref={focusAuditRecord}
                  className={cn(
                    "flex justify-between items-center gap-2 py-1 px-0",
                    !tt.active && "opacity-50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon icon={tt.shape === "round" ? CircleIcon : SquareIcon} />
                    <span>
                      {tt.name}
                      <small className="block text-subtle">
                        {tt.shape === "round"
                          ? m.admin_table_shape_round()
                          : m.admin_table_shape_rectangle()}
                        {" · "}
                        {tt.height_type === "high"
                          ? m.admin_table_height_type_high()
                          : m.admin_table_height_type_low()}
                        {" · "}
                        {tt.capacity === 1
                          ? m.admin_table_type_seat()
                          : m.admin_table_type_seats({ count: tt.capacity })}
                      </small>
                    </span>
                  </span>
                  {!isArchived && (
                    <RowActions
                      className="shrink-0"
                      destructive={
                        tt.active ? undefined : (
                          <RowActionButton
                            destructive
                            icon={TrashIcon}
                            label={m.admin_delete_item({ name: tt.name })}
                            onClick={() => setConfirmDeleteTableTypeId(tt.id)}
                          />
                        )
                      }
                    >
                      {tt.active && (
                        <RowActionButton
                          icon={PencilIcon}
                          label={m.admin_edit_item({ name: tt.name })}
                          onClick={() => openEditTableType(tt)}
                        />
                      )}
                      {tt.active ? (
                        <RowActionButton
                          icon={ArchiveIcon}
                          label={`${m.admin_content_archive()}: ${tt.name}`}
                          onClick={() => handleArchiveTableType(tt.id)}
                        />
                      ) : (
                        <RowActionButton
                          variant="outline-success"
                          icon={RotateCcwIcon}
                          label={`${m.admin_content_restore()}: ${tt.name}`}
                          onClick={() => handleRestoreTableType(tt.id)}
                        />
                      )}
                    </RowActions>
                  )}
                </PresentationListItem>
              ))}
            </PresentationList>
          )}
        </CardContent>
      )}
    </Card>
  );
}

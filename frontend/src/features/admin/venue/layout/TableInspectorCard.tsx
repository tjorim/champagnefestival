import {
  ADMIN_CONTROL_CLASS,
  ADMIN_LABEL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { RotateCcwIcon, RotateCwIcon, TableIcon, TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Registration } from "@/types/registration";
import type { FloorTable, TableType, Layout } from "@/api-types";
import { RowActionDivider } from "@/components/admin/RowActions";
import { type TableInspectorState } from "./useTableInspectorState";

interface TableInspectorCardProps {
  table: FloorTable;
  tableTypes: TableType[];
  venueId: string | undefined;
  layouts: Layout[];
  tables: FloorTable[];
  registrations: Registration[];
  activeLayout: Layout | undefined;
  inspector: TableInspectorState;
  onRotateTable: (tableId: string, rotation: number) => void;
  onUpdateTable: (tableId: string, name: string) => Promise<void>;
  onChangeTableType: (tableId: string, tableTypeId: string) => Promise<void>;
  onRequestDelete: (tableId: string) => void;
}

export function TableInspectorCard({
  table: selectedTableData,
  tableTypes,
  venueId,
  layouts,
  tables,
  registrations,
  activeLayout,
  inspector,
  onRotateTable,
  onUpdateTable,
  onChangeTableType,
  onRequestDelete,
}: TableInspectorCardProps) {
  const {
    updateTableError,
    setUpdateTableError,
    allocationError,
    allocationPending,
    bookingToAssign,
    setBookingToAssign,
    guestsToAssign,
    setGuestsToAssign,
    savePlanAllocations,
  } = inspector;
  const selectedType = tableTypes.find((t) => t.id === selectedTableData.table_type_id);
  const selectedRegistrations = registrations.filter((r) =>
    selectedTableData.registration_ids.includes(r.id),
  );
  const eventLayoutIds = new Set(
    layouts
      .filter((layout) => layout.event_id === activeLayout?.event_id)
      .map((layout) => layout.id),
  );
  const eventTables = tables.filter((table) => eventLayoutIds.has(table.layout_id));
  const assignableRegistrations = registrations.filter((registration) => {
    if (registration.status === "cancelled" || registration.event_id !== activeLayout?.event_id)
      return false;
    if (
      registration.allocations?.some((allocation) => allocation.table_id === selectedTableData?.id)
    )
      return false;
    const used = registration.booked_table_quantity
      ? (registration.allocations?.length ?? 0)
      : (registration.allocations?.reduce((sum, allocation) => sum + allocation.guest_count, 0) ??
        0);
    return used < (registration.booked_table_quantity || registration.guest_count);
  });
  const selectedBookingToAssign = assignableRegistrations.find(
    (item) => item.id === bookingToAssign,
  );
  return (
    <Card tone="warning" className="mb-4">
      <CardHeader className="flex flex-wrap gap-2 items-center justify-between border-warning">
        <span className="font-semibold">
          <Icon icon={TableIcon} className="me-2" />
          {m.admin_table_label()}: {selectedTableData.name}
        </span>
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="secondary">
            {selectedTableData.capacity} {m.admin_guests_count()}
          </Badge>
          {selectedType && (
            <Badge variant="secondary" className="text-content">
              {selectedType.name}
            </Badge>
          )}
          {selectedType && (
            <Badge
              variant={selectedType.height_type === "high" ? "info" : "dark"}
              className="border border-subtle"
            >
              {selectedType.height_type === "high"
                ? m.admin_table_height_type_high()
                : m.admin_table_height_type_low()}
            </Badge>
          )}
          {selectedType?.shape !== "round" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRotateTable(selectedTableData.id, selectedTableData.rotation - 15)}
                title={m.admin_layout_rotate_ccw()}
                aria-label={m.admin_layout_rotate_ccw()}
              >
                <Icon icon={RotateCcwIcon} />
              </Button>
              <span className="text-subtle text-sm min-w-14 text-center">
                {Math.round(selectedTableData.rotation)}°
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRotateTable(selectedTableData.id, selectedTableData.rotation + 15)}
                title={m.admin_layout_rotate_cw()}
                aria-label={m.admin_layout_rotate_cw()}
              >
                <Icon icon={RotateCwIcon} />
              </Button>
            </>
          )}
          <RowActionDivider />
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => onRequestDelete(selectedTableData.id)}
            disabled={selectedTableData.registration_ids.length > 0}
            title={
              selectedTableData.registration_ids.length > 0
                ? m.admin_layout_table_delete_blocked()
                : m.admin_delete_item({ name: selectedTableData.name })
            }
            aria-label={m.admin_delete_item({ name: selectedTableData.name })}
          >
            <Icon icon={TrashIcon} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {updateTableError && (
          <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-2 text-sm">
            {updateTableError}
          </Alert>
        )}
        {allocationError && (
          <Alert role="alert" variant="danger" className="py-1 mb-2 text-sm">
            {allocationError}
          </Alert>
        )}
        <AdminField className="mb-4" controlId="table-name-edit">
          <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_table_name()}</AdminLabel>
          <AdminInput
            size="sm"
            type="text"
            className={ADMIN_CONTROL_CLASS}
            defaultValue={selectedTableData.name}
            onBlur={async (e) => {
              const val = e.target.value.trim();
              if (val && val !== selectedTableData.name) {
                setUpdateTableError(null);
                try {
                  await onUpdateTable(selectedTableData.id, val);
                } catch (err) {
                  setUpdateTableError(apiErrorMessage(err, m.admin_content_error_save()));
                }
              }
            }}
            key={`name-${selectedTableData.id}`}
          />
        </AdminField>
        <AdminField className="mb-4" controlId="table-type-select">
          <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_layout_table_type_label()}</AdminLabel>
          <AdminSelect
            size="sm"
            className={ADMIN_CONTROL_CLASS}
            value={selectedTableData.table_type_id}
            onValueChange={async (e) => {
              setUpdateTableError(null);
              try {
                await onChangeTableType(selectedTableData.id, e);
              } catch (err) {
                setUpdateTableError(apiErrorMessage(err, m.admin_content_error_save()));
              }
            }}
            key={`type-${selectedTableData.id}`}
          >
            {tableTypes
              .filter(
                (tt) =>
                  (tt.venue_id === venueId || tt.id === selectedTableData.table_type_id) &&
                  (tt.active || tt.id === selectedTableData.table_type_id),
              )
              .map((tt) => (
                <AdminOption key={tt.id} value={tt.id} disabled={!tt.active}>
                  {tt.name}
                </AdminOption>
              ))}
          </AdminSelect>
        </AdminField>
        {selectedRegistrations.length === 0 ? (
          <p className="text-subtle mb-0">{m.admin_unassigned()}</p>
        ) : (
          <PresentationList flush className="mb-4">
            {selectedRegistrations.map((r) => (
              <PresentationListItem key={r.id} className="border-border">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold me-auto">{r.person.name}</span>
                  {(() => {
                    const allocation = r.allocations?.find(
                      (item) => item.table_id === selectedTableData.id,
                    );
                    if (!allocation) return null;
                    return (
                      <>
                        <AdminInput
                          aria-label={`${m.admin_guests_count()} ${r.person.name}`}
                          type="number"
                          min={allocation.exclusive ? 0 : 1}
                          max={20}
                          defaultValue={allocation.guest_count}
                          disabled={allocationPending || allocation.exclusive}
                          className="bg-muted text-content border-input w-20"

                          onBlur={(event) => {
                            const guestCount = Number(event.currentTarget.value);
                            if (
                              Number.isInteger(guestCount) &&
                              guestCount >= 1 &&
                              guestCount !== allocation.guest_count
                            ) {
                              void savePlanAllocations(
                                r,
                                (r.allocations ?? []).map((item) =>
                                  item.table_id === selectedTableData.id
                                    ? { ...item, guest_count: guestCount }
                                    : item,
                                ),
                              );
                            }
                          }}
                        />
                        <AdminSelect
                          aria-label={`${m.admin_layout_move_booking()} ${r.person.name}`}
                          size="sm"
                          value={selectedTableData.id}
                          disabled={allocationPending}
                          onValueChange={(event) =>
                            void savePlanAllocations(
                              r,
                              (r.allocations ?? []).map((item) =>
                                item.table_id === selectedTableData.id
                                  ? { ...item, table_id: event }
                                  : item,
                              ),
                            )
                          }
                        >
                          {eventTables
                            .filter(
                              (table) =>
                                table.id === selectedTableData.id ||
                                !(r.allocations ?? []).some((item) => item.table_id === table.id),
                            )
                            .map((table) => (
                              <AdminOption key={table.id} value={table.id}>
                                {table.name}
                              </AdminOption>
                            ))}
                        </AdminSelect>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          disabled={allocationPending}
                          onClick={() =>
                            void savePlanAllocations(
                              r,
                              (r.allocations ?? []).filter(
                                (item) => item.table_id !== selectedTableData.id,
                              ),
                            )
                          }
                        >
                          {m.admin_layout_remove_booking()}
                        </Button>
                      </>
                    );
                  })()}
                </div>
              </PresentationListItem>
            ))}
          </PresentationList>
        )}
        <div className="border-t border-subtle pt-4 mt-4">
          <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_layout_assign_booking()}</AdminLabel>
          <div className="flex flex-wrap gap-2">
            <AdminSelect
              aria-label={m.admin_layout_assign_booking()}
              value={bookingToAssign}
              disabled={allocationPending || assignableRegistrations.length === 0}
              onValueChange={(event) => {
                const id = event;
                const booking = assignableRegistrations.find((item) => item.id === id);
                const alreadyAssigned =
                  booking?.allocations?.reduce((sum, item) => sum + item.guest_count, 0) ?? 0;
                setBookingToAssign(id);
                setGuestsToAssign(
                  booking?.booked_table_quantity
                    ? 0
                    : Math.max(1, (booking?.guest_count ?? 1) - alreadyAssigned),
                );
              }}
            >
              <AdminOption value="">{m.admin_layout_choose_booking()}</AdminOption>
              {assignableRegistrations.map((registration) => (
                <AdminOption key={registration.id} value={registration.id}>
                  {registration.person.name} · {registration.id}
                </AdminOption>
              ))}
            </AdminSelect>
            <AdminInput
              aria-label={m.admin_guests_count()}
              type="number"
              min={selectedBookingToAssign?.booked_table_quantity ? 0 : 1}
              max={20}
              value={guestsToAssign}
              disabled={
                allocationPending ||
                !bookingToAssign ||
                Boolean(selectedBookingToAssign?.booked_table_quantity)
              }
              onChange={(event) => setGuestsToAssign(Number(event.target.value))}
              className="w-24"
            />
            <Button
              variant="warning"
              disabled={allocationPending || !selectedBookingToAssign}
              onClick={async () => {
                if (!selectedBookingToAssign) return;
                await savePlanAllocations(selectedBookingToAssign, [
                  ...(selectedBookingToAssign.allocations ?? []),
                  {
                    table_id: selectedTableData.id,
                    guest_count: selectedBookingToAssign.booked_table_quantity ? 0 : guestsToAssign,
                    exclusive: Boolean(selectedBookingToAssign.booked_table_quantity),
                  },
                ]);
                setBookingToAssign("");
              }}
            >
              {m.admin_layout_assign_booking()}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

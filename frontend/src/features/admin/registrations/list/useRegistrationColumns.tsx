import { formatNumber } from "@/lib/format/numberUtils";
import { Button } from "@/components/ui/button";
import { ADMIN_CONTROL_CLASS, AdminSelect, AdminOption } from "@/components/admin/AdminFields";
import {
  CheckIcon,
  CircleCheckIcon,
  ContactRoundIcon,
  EllipsisIcon,
  EuroIcon,
  LogInIcon,
  PencilIcon,
  QrCodeIcon,
  ShoppingCartIcon,
  XIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import type { FloorTable } from "@/api-types";
import type { Registration, RegistrationStatus } from "@/types/registration";
import { createAppColumnHelper } from "../../shared/useAdminTable";
import {
  statusBadgeVariant,
  paymentBadgeVariant,
  statusLabel,
  paymentLabel,
  isStandaloneRegistration,
} from "./registrationDisplay";
import { type RegistrationSelection } from "./useRegistrationSelection";

const columnHelper = createAppColumnHelper<Registration>();

interface RegistrationColumnsOptions {
  pageRegistrations: Registration[];
  selection: RegistrationSelection;
  allContactPersonIds: Set<string>;
  tables: FloorTable[];
  tableOccupancy: Map<string, number>;
  handleAssignTable: (registrationId: string, tableId: string) => void;
  onViewDetail: (registration: Registration) => void;
  onUpdateStatus: (id: string, status: RegistrationStatus) => Promise<void>;
  handleCheckIn: (id: string, checkedIn?: boolean) => Promise<void>;
  handleIssueStrap: (id: string) => Promise<void>;
  handleRecordPayment: (id: string) => Promise<void>;
  isOnline: boolean;
  processingIds: Set<string>;
  setQrTargetId: (id: string | null) => void;
}

/** The registration table's columns: the selection checkbox followed by the data columns. */
export function useRegistrationColumns({
  pageRegistrations,
  selection,
  allContactPersonIds,
  tables,
  tableOccupancy,
  handleAssignTable,
  onViewDetail,
  onUpdateStatus,
  handleCheckIn,
  handleIssueStrap,
  handleRecordPayment,
  isOnline,
  processingIds,
  setQrTargetId,
}: RegistrationColumnsOptions) {
  const locale = getLocale();
  const {
    selectedIds,
    setSelectionRecords,
    setSelectAllMatchingActive,
    setSelectAllMatchingError,
    setSelectedIds,
  } = selection;
  // Isolated memo so that selectedIds changes only rebuild the select column, not all columns
  const selectColumn = useMemo(
    () =>
      columnHelper.display({
        id: "select",
        header: () => {
          const allIds = pageRegistrations.map((r) => r.id);
          const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
          return (
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && allIds.some((id) => selectedIds.has(id))}
              onCheckedChange={() => {
                setSelectionRecords(
                  (previous) =>
                    new Map([
                      ...previous,
                      ...pageRegistrations.map((record) => [record.id, record] as const),
                    ]),
                );
                setSelectAllMatchingActive(false);
                setSelectAllMatchingError(null);
                if (allSelected) {
                  setSelectedIds((prev) => {
                    const next = new Set<string>(prev);
                    allIds.forEach((id) => next.delete(id));
                    return next;
                  });
                } else {
                  setSelectedIds((prev) => new Set<string>([...prev, ...allIds]));
                }
              }}
              aria-label={m.admin_select_all()}
            />
          );
        },
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.id)}
            onCheckedChange={() => {
              setSelectionRecords((previous) => new Map(previous).set(row.id, row.original));
              setSelectAllMatchingActive(false);
              setSelectAllMatchingError(null);
              setSelectedIds((prev) => {
                const next = new Set<string>(prev);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                return next;
              });
            }}
            aria-label={m.admin_select_registration({ name: row.original.person.name })}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        meta: { tdClassName: "align-middle" },
      }),
    [
      selectedIds,
      pageRegistrations,
      setSelectionRecords,
      setSelectAllMatchingActive,
      setSelectAllMatchingError,
      setSelectedIds,
    ],
  );

  const dataColumns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((row) => row.person.name, {
          id: "name",
          header: m.registration_name(),
          cell: ({ row }) => {
            const reg = row.original;
            const isLinked = allContactPersonIds.has(reg.person.id);
            const isStandalone = isStandaloneRegistration(reg);
            return (
              <>
                <div className="font-semibold flex flex-wrap items-center gap-1">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-left whitespace-normal wrap-anywhere"
                    onClick={() => onViewDetail(reg)}
                  >
                    {reg.person.name}
                  </Button>
                  {isLinked && (
                    <span
                      role="img"
                      title={m.admin_linked_organization_title()}
                      aria-label={m.admin_allocation_contact_aria()}
                    >
                      <Icon icon={ContactRoundIcon} className="text-primary" />
                    </span>
                  )}
                  <Badge variant={isStandalone ? "info" : "warning"}>
                    {(() => {
                      const et = reg.event?.edition?.edition_type;
                      if (et === "bourse") return m.admin_edition_type_bourse();
                      if (et === "capsule_exchange") return m.admin_edition_type_capsule_exchange();
                      return m.admin_edition_type_festival();
                    })()}
                  </Badge>
                </div>
                <div className="text-subtle text-sm wrap-anywhere">{reg.person.email}</div>
                {!isStandalone && reg.order_items.length > 0 && (
                  <div className="text-highlight text-sm">
                    <Icon icon={ShoppingCartIcon} className="me-1" />
                    {m.admin_order_delivery_progress({
                      delivered: reg.order_items.filter((item) => item.delivered).length,
                      total: reg.order_items.length,
                    })}
                  </div>
                )}
              </>
            );
          },
        }),
        columnHelper.accessor((row) => row.event?.title ?? row.event_id, {
          id: "event",
          header: m.admin_event_label(),
          cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span>,
          meta: { tdClassName: "hidden md:table-cell" },
        }),
        columnHelper.accessor("guest_count", {
          header: m.admin_guests_count(),
          cell: ({ getValue }) => formatNumber(getValue(), locale),
        }),
        columnHelper.accessor("status", {
          header: m.admin_status_label(),
          cell: ({ getValue }) => (
            <Badge variant={statusBadgeVariant(getValue())}>{statusLabel(getValue())}</Badge>
          ),
        }),
        columnHelper.accessor("payment_status", {
          header: m.admin_payment_label(),
          cell: ({ getValue }) => (
            <Badge variant={paymentBadgeVariant(getValue())}>{paymentLabel(getValue())}</Badge>
          ),
          meta: { tdClassName: "hidden lg:table-cell" },
        }),
        columnHelper.accessor("checked_in", {
          header: m.admin_check_in_title(),
          cell: ({ row }) => {
            const reg = row.original;
            const isStandalone = isStandaloneRegistration(reg);
            return (
              <>
                {reg.checked_in ? (
                  <Badge variant="success">
                    <Icon icon={CircleCheckIcon} className="me-1" />
                    {m.admin_checked_in()}
                  </Badge>
                ) : (
                  <Badge variant="secondary">{m.admin_not_checked_in()}</Badge>
                )}
                {!isStandalone && reg.strap_issued && (
                  <Badge variant="info" className="ms-1" title={m.admin_strap_issued()}>
                    <Icon icon={ContactRoundIcon} />
                    <span className="sr-only">{m.admin_strap_issued()}</span>
                  </Badge>
                )}
              </>
            );
          },
          meta: { tdClassName: "hidden md:table-cell" },
        }),
        columnHelper.display({
          id: "table",
          header: m.admin_tables_tab(),
          enableSorting: false,
          cell: ({ row }) => {
            const reg = row.original;
            const isStandalone = isStandaloneRegistration(reg);
            return (reg.allocations?.length ?? 0) > 1 ? (
              <span>
                {reg.table_names?.length
                  ? new Intl.ListFormat(getLocale()).format(reg.table_names)
                  : m.admin_assigned_table_unavailable()}
              </span>
            ) : isStandalone && !(reg.booked_table_quantity ?? 0) ? (
              <span className="text-subtle text-sm">—</span>
            ) : (
              <AdminSelect
                size="sm"
                className={ADMIN_CONTROL_CLASS}
                value={reg.table_id ?? ""}
                onValueChange={(e) => handleAssignTable(reg.id, e)}
                aria-label={m.admin_action_assign_table()}
              >
                <AdminOption value="">{m.admin_unassigned()}</AdminOption>
                {reg.table_id &&
                  !tables.some(
                    (table) => table.id === reg.table_id && table.event_id === reg.event_id,
                  ) && (
                    <AdminOption value={reg.table_id} disabled>
                      {reg.table_names?.[0] || m.admin_assigned_table_unavailable()}
                    </AdminOption>
                  )}
                {tables
                  .filter((t) => t.event_id === reg.event_id)
                  .map((t) => {
                    const ownAtTable =
                      reg.allocations?.find((a) => a.table_id === t.id)?.guest_count ?? 0;
                    const remaining = Math.max(
                      0,
                      t.capacity - (tableOccupancy.get(t.id) ?? 0) + ownAtTable,
                    );
                    return (
                      <AdminOption key={t.id} value={t.id}>
                        {t.name} ({m.admin_table_capacity_remaining({ count: remaining })})
                      </AdminOption>
                    );
                  })}
              </AdminSelect>
            );
          },
          meta: { tdClassName: "hidden lg:table-cell" },
        }),
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const reg = row.original;
            return (
              <div className="flex flex-wrap items-center gap-1 md:flex-nowrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewDetail(reg)}
                  title={m.admin_view_edit_booking()}
                  aria-label={`${m.admin_view_edit_booking()}: ${reg.person.name}`}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                {reg.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => onUpdateStatus(reg.id, "confirmed")}
                    title={m.admin_action_confirm()}
                    aria-label={m.admin_action_confirm()}
                  >
                    <Icon icon={CheckIcon} />
                  </Button>
                )}
                {!reg.checked_in && reg.status !== "cancelled" && (
                  <Button
                    size="icon-sm"
                    variant="outline-success"
                    onClick={() => handleCheckIn(reg.id)}
                    disabled={!isOnline || processingIds.has(reg.id)}
                    title={m.admin_mark_checked_in()}
                    aria-label={m.admin_mark_checked_in()}
                  >
                    <Icon icon={LogInIcon} />
                  </Button>
                )}
                {reg.checked_in && !reg.strap_issued && !isStandaloneRegistration(reg) && (
                  <Button
                    size="icon-sm"
                    variant="outline-info"
                    onClick={() => handleIssueStrap(reg.id)}
                    disabled={!isOnline || processingIds.has(reg.id)}
                    title={m.admin_issue_strap()}
                    aria-label={m.admin_issue_strap()}
                  >
                    <Icon icon={ContactRoundIcon} />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="sm" />}
                    id={`reg-more-${reg.id}`}
                    aria-label={m.admin_more_actions_for({ name: reg.person.name })}
                  >
                    <EllipsisIcon className="size-4" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    finalFocus={() => document.getElementById(`reg-more-${reg.id}`) ?? false}
                  >
                    {reg.checked_in && (
                      <DropdownMenuItem
                        disabled={!isOnline || processingIds.has(reg.id)}
                        onClick={() => void handleCheckIn(reg.id, false)}
                      >
                        {m.admin_undo_check_in()}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onViewDetail(reg)}>
                      {m.admin_view_edit_booking()}
                    </DropdownMenuItem>
                    {reg.status !== "cancelled" && (
                      <DropdownMenuItem onClick={() => setQrTargetId(reg.id)}>
                        <QrCodeIcon className="size-4" aria-hidden="true" />
                        {m.admin_qr_code()}
                      </DropdownMenuItem>
                    )}
                    {reg.status !== "cancelled" && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onUpdateStatus(reg.id, "cancelled")}
                      >
                        <XIcon className="size-4" aria-hidden="true" />
                        {m.admin_action_cancel()}
                      </DropdownMenuItem>
                    )}
                    {reg.payment_status !== "paid" && (
                      <DropdownMenuItem
                        disabled={processingIds.has(reg.id)}
                        onClick={() => void handleRecordPayment(reg.id)}
                      >
                        <EuroIcon className="size-4" aria-hidden="true" />
                        {m.admin_action_mark_paid()}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          },
        }),
      ]),
    [
      locale,
      allContactPersonIds,
      tables,
      tableOccupancy,
      handleAssignTable,
      onViewDetail,
      onUpdateStatus,
      handleCheckIn,
      handleIssueStrap,
      handleRecordPayment,
      isOnline,
      processingIds,
      setQrTargetId,
    ],
  );

  const columns = useMemo(
    () => columnHelper.columns([selectColumn, ...dataColumns]),
    [selectColumn, dataColumns],
  );

  return columns;
}

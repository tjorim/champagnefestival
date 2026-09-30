import { FileSpreadsheetIcon, PencilIcon, ThumbsUpIcon, TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { AdminSortableHeader } from "./AdminSortableHeader";
import { useState, useMemo, useCallback } from "react";
import { type FilterFn, type SortingState } from "@tanstack/react-table";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Form from "react-bootstrap/Form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import Spinner from "react-bootstrap/Spinner";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";
import { useAppTable, createAppColumnHelper, type AdminTableFeatures } from "@/hooks/useAdminTable";
import VolunteerFormModal, { type VolunteerFormData } from "./VolunteerFormModal";
import { AdminTablePagination } from "./AdminTablePagination";
import { downloadVolunteersCsv } from "@/utils/adminFetch";
import { devError } from "@/utils/devLog";

interface VolunteersManagementProps {
  volunteers: Person[];
  isLoading: boolean;
  authHeaders: () => Record<string, string>;
  onCreate: (data: VolunteerFormData) => Promise<void>;
  onUpdate: (id: string, data: VolunteerFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type ActiveFilter = "all" | "active" | "inactive";

const columnHelper = createAppColumnHelper<Person>();

function formatPeriod(period: Person["helpPeriods"][number]): string {
  return period.lastHelpDay
    ? `${period.firstHelpDay} → ${period.lastHelpDay}`
    : `${period.firstHelpDay} →`;
}

const volunteersGlobalFilter: FilterFn<AdminTableFeatures, Person> = (
  row,
  _columnId,
  filterValue: string,
) => {
  const s = filterValue.toLowerCase();
  return (
    row.original.name.toLowerCase().includes(s) ||
    row.original.address.toLowerCase().includes(s) ||
    (row.original.nationalRegisterNumber ?? "").toLowerCase().includes(s) ||
    (row.original.eidDocumentNumber ?? "").toLowerCase().includes(s) ||
    row.original.helpPeriods.some(
      (period) =>
        period.firstHelpDay.toLowerCase().includes(s) ||
        (period.lastHelpDay ?? "").toLowerCase().includes(s) ||
        period.notes.toLowerCase().includes(s),
    )
  );
};
volunteersGlobalFilter.autoRemove = (val: unknown) => !val || String(val) === "";

export default function VolunteersManagement({
  volunteers,
  isLoading,
  authHeaders,
  onCreate,
  onUpdate,
  onDelete,
}: VolunteersManagementProps) {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Person | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const handleExportCsv = useCallback(async () => {
    setExportError("");
    setExporting(true);
    try {
      await downloadVolunteersCsv(authHeaders);
    } catch (err) {
      devError("Failed to export volunteers", err);
      setExportError(err instanceof Error ? err.message : m.admin_volunteers_export_csv_error());
    } finally {
      setExporting(false);
    }
  }, [authHeaders]);

  // Pre-filter by active status; text search handled by TanStack
  const preFiltered = useMemo(
    () =>
      activeFilter === "all"
        ? volunteers
        : volunteers.filter((v) => (activeFilter === "active" ? v.active : !v.active)),
    [volunteers, activeFilter],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(deletingId);
      setDeleteSuccess(true);
      setDeletingId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : m.admin_volunteers_error_delete());
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveVolunteer = async (data: VolunteerFormData) => {
    if (editingVolunteer) {
      await onUpdate(editingVolunteer.id, data);
      setUpdateSuccess(true);
    } else {
      await onCreate(data);
      setCreateSuccess(true);
    }
  };

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((row) => row.name, {
          id: "name",
          header: m.registration_name(),
          cell: ({ row }) => {
            const volunteer = row.original;
            return (
              <div className="tw:font-semibold tw:flex tw:items-center tw:gap-1">
                {volunteer.name}
                {!volunteer.active && (
                  <Badge bg="secondary" className="tw:ms-1">
                    {m.admin_people_inactive_badge_label()}
                  </Badge>
                )}
              </div>
            );
          },
        }),
        columnHelper.accessor("address", {
          header: m.admin_people_address_label(),
          cell: ({ getValue }) => <span className="tw:text-sm">{String(getValue() ?? "")}</span>,
        }),
        columnHelper.accessor("nationalRegisterNumber", {
          header: m.admin_people_national_register_number_label(),
          enableSorting: false,
          cell: ({ getValue }) => <span className="tw:text-sm">{String(getValue() ?? "")}</span>,
        }),
        columnHelper.accessor("eidDocumentNumber", {
          header: m.admin_people_eid_document_number_label(),
          enableSorting: false,
          cell: ({ getValue }) => <span className="tw:text-sm">{String(getValue() ?? "")}</span>,
        }),
        columnHelper.display({
          id: "helpPeriods",
          header: m.admin_volunteers_help_periods_label(),
          enableSorting: false,
          cell: ({ row }) => (
            <div className="tw:flex tw:flex-col tw:gap-1 tw:text-sm">
              {row.original.helpPeriods.length > 0 ? (
                row.original.helpPeriods.map((period) => (
                  <span key={period.id} className="tw:text-subtle">
                    {formatPeriod(period)}
                    {period.notes && (
                      <span className="tw:block tw:text-subtle opacity-75">{period.notes}</span>
                    )}
                  </span>
                ))
              ) : (
                <span className="tw:text-subtle">{m.admin_volunteers_no_help_periods()}</span>
              )}
            </div>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const volunteer = row.original;
            return (
              <div className="tw:flex tw:flex-wrap tw:gap-1">
                <Button
                  size="sm"
                  variant="outline-light"
                  onClick={() => {
                    setEditingVolunteer(volunteer);
                    setShowForm(true);
                  }}
                  title={m.admin_volunteers_edit_title()}
                  aria-label={m.admin_volunteers_edit_title()}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => {
                    setDeletingId(volunteer.id);
                    setDeleteError("");
                  }}
                  title={m.admin_volunteers_delete_title()}
                  aria-label={m.admin_volunteers_delete_title()}
                >
                  <Icon icon={TrashIcon} />
                </Button>
              </div>
            );
          },
        }),
      ]),
    [setEditingVolunteer, setShowForm, setDeletingId, setDeleteError],
  );

  const table = useAppTable(
    {
      data: preFiltered,
      columns,
      state: { sorting, globalFilter: q },
      initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
      manualPagination: false,
      getRowId: (row) => row.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setQ,
      globalFilterFn: volunteersGlobalFilter,
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
    }),
  );

  return (
    <>
      <Card tone="secondary">
        <CardHeader className="tw:pb-2">
          <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:mb-2">
            <span className="tw:font-semibold">{m.admin_volunteers_tab()}</span>
            <div className="tw:flex tw:gap-2">
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => void handleExportCsv()}
                disabled={exporting}
              >
                <Icon icon={FileSpreadsheetIcon} className="tw:me-1" />
                {m.admin_volunteers_export_csv()}
              </Button>
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => {
                  setEditingVolunteer(null);
                  setShowForm(true);
                }}
              >
                <Icon icon={ThumbsUpIcon} className="tw:me-1" />
                {m.admin_volunteers_add()}
              </Button>
            </div>
          </div>
          {exportError && (
            <Alert
              variant="danger"
              className="tw:py-1 tw:mb-2"
              dismissible
              onClose={() => setExportError("")}
            >
              {exportError}
            </Alert>
          )}
          <div className="tw:flex tw:flex-wrap tw:gap-2 tw:items-center">
            <Form.Select
              size="sm"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              className="bg-dark tw:text-content border-secondary"
              style={{ maxWidth: 180 }}
              aria-label={m.admin_people_active_label()}
            >
              <option value="all">{m.admin_volunteers_filter_all()}</option>
              <option value="active">{m.admin_volunteers_filter_active()}</option>
              <option value="inactive">{m.admin_volunteers_filter_inactive()}</option>
            </Form.Select>
            <Form.Control
              size="sm"
              type="search"
              placeholder={m.admin_volunteers_search_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-dark tw:text-content border-secondary"
              style={{ maxWidth: 280 }}
            />
          </div>
        </CardHeader>

        <CardContent className="tw:p-0">
          {createSuccess && (
            <Alert
              variant="success"
              dismissible
              className="tw:m-4 tw:mb-0"
              onClose={() => setCreateSuccess(false)}
            >
              {m.admin_volunteers_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert
              variant="success"
              dismissible
              className="tw:m-4 tw:mb-0"
              onClose={() => setUpdateSuccess(false)}
            >
              {m.admin_volunteers_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert
              variant="success"
              dismissible
              className="tw:m-4 tw:mb-0"
              onClose={() => setDeleteSuccess(false)}
            >
              {m.admin_volunteers_delete_success()}
            </Alert>
          )}

          {isLoading ? (
            <div className="tw:text-center tw:py-6">
              <Spinner animation="border" variant="primary" size="sm" />
            </div>
          ) : table.getPrePaginatedRowModel().rows.length === 0 ? (
            <p className="tw:text-subtle tw:text-center tw:py-6 tw:mb-0">
              {m.admin_volunteers_no_results()}
            </p>
          ) : (
            <div data-tailwind-migrated="true" className="tw:w-full">
              <Table>
                <caption className="tw:sr-only">{m.admin_volunteers_table_caption()}</caption>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <AdminSortableHeader key={header.id} column={header.column}>
                          <table.FlexRender header={header} />
                        </AdminSortableHeader>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cell.column.columnDef.meta?.tdClassName}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <AdminTablePagination
            total={table.getPrePaginatedRowModel().rows.length}
            pageIndex={table.state.pagination.pageIndex}
            pageSize={table.state.pagination.pageSize}
            canPreviousPage={table.getCanPreviousPage()}
            canNextPage={table.getCanNextPage()}
            onPreviousPage={() => table.previousPage()}
            onNextPage={() => table.nextPage()}
            onPageSizeChange={(size) => table.setPageSize(size)}
          />
        </CardContent>
      </Card>

      {deletingId && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeletingId(null);
          }}
        >
          <DialogContent admin size="default">
            <DialogHeader>
              <DialogTitle className="tw:text-destructive">
                <Icon icon={TrashIcon} className="tw:me-2" />
                {m.admin_volunteers_delete_title()}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              {deleteError && <Alert variant="danger">{deleteError}</Alert>}
              <p>{m.admin_volunteers_delete_confirm()}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline-secondary" size="sm" onClick={() => setDeletingId(null)}>
                {m.admin_action_cancel()}
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? (
                  <Spinner as="span" animation="border" size="sm" className="tw:me-1" />
                ) : (
                  <Icon icon={TrashIcon} className="tw:me-1" />
                )}
                {m.admin_action_confirm()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <VolunteerFormModal
        show={showForm}
        volunteer={editingVolunteer}
        onSave={handleSaveVolunteer}
        onHide={() => {
          setShowForm(false);
          setEditingVolunteer(null);
        }}
      />
    </>
  );
}

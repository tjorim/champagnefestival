import { Button } from "@/components/ui/button";
import { AdminSelect, AdminOption, AdminInput } from "@/components/admin/AdminFields";
import { ContactRoundIcon, DownloadIcon, MailIcon, PencilIcon, TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { AdminSortableHeader } from "./AdminSortableHeader";
import { useState, useMemo, useCallback } from "react";
import {
  type FilterFn,
  type SortingState,
  type ColumnVisibilityState,
} from "@tanstack/react-table";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";
import { useAppTable, createAppColumnHelper, type AdminTableFeatures } from "@/hooks/useAdminTable";
import { exportToCsv } from "@/utils/csvExport";
import MemberFormModal, { type MemberFormData } from "./MemberFormModal";
import { ColumnVisibilityDropdown } from "./ColumnVisibilityDropdown";
import { AdminTablePagination } from "./AdminTablePagination";
import { loadColVis, saveColVis } from "@/utils/columnVisibility";
import { buildMemberEmailDraft, type EmailDraft } from "@/utils/emailComposer";
import EmailComposeModal from "./EmailComposeModal";

const COL_VIS_KEY = "admin-col-vis-members";

interface MembersManagementProps {
  members: Person[];
  registrationCountByPersonId: Record<string, number>;
  isLoading: boolean;
  onCreate: (data: MemberFormData) => Promise<void>;
  onUpdate: (id: string, data: MemberFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type ActiveFilter = "all" | "active" | "inactive";

const columnHelper = createAppColumnHelper<Person>();

function truncateText(value: string, limit = 80): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

const membersGlobalFilter: FilterFn<AdminTableFeatures, Person> = (
  row,
  _columnId,
  filterValue: string,
) => {
  const s = filterValue.toLowerCase();
  const phoneQ = s.replace(/[\s\-().+]/g, "");
  return (
    row.original.name.toLowerCase().includes(s) ||
    (row.original.email?.toLowerCase() ?? "").includes(s) ||
    (phoneQ.length > 0 &&
      (row.original.phone?.replace(/[\s\-().+]/g, "") ?? "").includes(phoneQ)) ||
    (row.original.address?.toLowerCase() ?? "").includes(s) ||
    (row.original.clubName?.toLowerCase() ?? "").includes(s) ||
    (row.original.notes?.toLowerCase() ?? "").includes(s)
  );
};
membersGlobalFilter.autoRemove = (val: unknown) => !val || String(val) === "";

export default function MembersManagement({
  members,
  registrationCountByPersonId,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
}: MembersManagementProps) {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() =>
    loadColVis(COL_VIS_KEY),
  );
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Person | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);

  // Pre-filter by active status; text search handled by TanStack
  const preFiltered = useMemo(
    () =>
      activeFilter === "all"
        ? members
        : members.filter((m) => (activeFilter === "active" ? m.active : !m.active)),
    [members, activeFilter],
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
      setDeleteError(err instanceof Error ? err.message : m.admin_members_error_delete());
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveMember = async (data: MemberFormData) => {
    if (editingMember) {
      await onUpdate(editingMember.id, data);
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
            const member = row.original;
            return (
              <div className="font-semibold flex items-center gap-1">
                {member.name}
                {!member.active && (
                  <Badge variant="secondary" className="ms-1">
                    {m.admin_people_inactive_badge_label()}
                  </Badge>
                )}
              </div>
            );
          },
        }),
        columnHelper.accessor("email", {
          header: m.registration_email(),
          cell: ({ getValue }) => (
            <span className="text-sm">{String(getValue() ?? "") || "—"}</span>
          ),
        }),
        columnHelper.accessor("phone", {
          header: m.registration_phone(),
          cell: ({ getValue }) => (
            <span className="text-sm">{String(getValue() ?? "") || "—"}</span>
          ),
        }),
        columnHelper.accessor("clubName", {
          header: m.admin_people_club_name_label(),
          cell: ({ getValue }) => (
            <span className="text-sm">{String(getValue() ?? "") || "—"}</span>
          ),
        }),
        columnHelper.accessor("notes", {
          header: m.registration_notes(),
          enableSorting: false,
          cell: ({ row }) => {
            const notes = row.original.notes;
            const preview = truncateText(notes);
            return (
              <span className="text-sm text-subtle" title={notes || undefined}>
                {preview || "—"}
              </span>
            );
          },
        }),
        columnHelper.accessor((row) => registrationCountByPersonId[row.id] ?? 0, {
          id: "registrations",
          header: m.admin_registrations_tab(),
          cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span>,
        }),
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const member = row.original;
            return (
              <div className="flex flex-wrap gap-1">
                {member.email && (
                  <Button
                    size="sm"
                    variant="outline-warning"
                    onClick={() =>
                      setEmailDraft(
                        buildMemberEmailDraft(
                          member.name,
                          member.email,
                          member.preferredLanguage ?? "nl",
                        ),
                      )
                    }
                    title={m.admin_email_compose_for({ name: member.name })}
                    aria-label={m.admin_email_compose_for({ name: member.name })}
                  >
                    <Icon icon={MailIcon} />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingMember(member);
                    setShowForm(true);
                  }}
                  title={m.admin_members_edit_title()}
                  aria-label={m.admin_members_edit_title()}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => {
                    setDeletingId(member.id);
                    setDeleteError("");
                  }}
                  title={m.admin_members_delete_title()}
                  aria-label={m.admin_members_delete_title()}
                >
                  <Icon icon={TrashIcon} />
                </Button>
              </div>
            );
          },
        }),
      ]),
    [registrationCountByPersonId, setEditingMember, setShowForm, setDeletingId, setDeleteError],
  );

  const table = useAppTable(
    {
      data: preFiltered,
      columns,
      state: { sorting, globalFilter: q, columnVisibility },
      initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
      manualPagination: false,
      getRowId: (row) => row.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setQ,
      onColumnVisibilityChange: (updater) => {
        const next = typeof updater === "function" ? updater(columnVisibility) : updater;
        setColumnVisibility(next);
        saveColVis(COL_VIS_KEY, next);
      },
      globalFilterFn: membersGlobalFilter,
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      columnVisibility: state.columnVisibility,
      pagination: state.pagination,
    }),
  );

  const handleExportCsv = useCallback(() => {
    // Export every filtered row, not just the current page — pagination is a
    // display concern for the table, not a truncation of what gets exported.
    const rows = table.getPrePaginatedRowModel().rows.map(({ original: member }) => ({
      [m.registration_name()]: member.name,
      [m.registration_email()]: member.email,
      [m.registration_phone()]: member.phone,
      [m.admin_people_club_name_label()]: member.clubName,
      [m.registration_notes()]: member.notes,
      [m.admin_people_active_label()]: member.active ? m.admin_value_yes() : m.admin_value_no(),
    }));
    exportToCsv("members.csv", rows);
  }, [table]);

  return (
    <>
      <EmailComposeModal draft={emailDraft} onClose={() => setEmailDraft(null)} />
      <Card tone="secondary">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-semibold">{m.admin_members_tab()}</span>
            <div className="flex gap-2">
              <ColumnVisibilityDropdown table={table} tableId="members" />
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportCsv}
                disabled={table.getPrePaginatedRowModel().rows.length === 0}
              >
                <Icon icon={DownloadIcon} />
                {m.admin_export_csv()}
              </Button>
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => {
                  setEditingMember(null);
                  setShowForm(true);
                }}
              >
                <Icon icon={ContactRoundIcon} />
                {m.admin_members_add()}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <AdminSelect
              size="sm"
              value={activeFilter}
              onValueChange={(e) => setActiveFilter(e as ActiveFilter)}
              className="bg-muted text-content border-input max-w-45"

              aria-label={m.admin_people_active_label()}
            >
              <AdminOption value="all">{m.admin_members_filter_all()}</AdminOption>
              <AdminOption value="active">{m.admin_members_filter_active()}</AdminOption>
              <AdminOption value="inactive">{m.admin_members_filter_inactive()}</AdminOption>
            </AdminSelect>
            <AdminInput
              size="sm"
              type="search"
              placeholder={m.admin_members_search_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-muted text-content border-input max-w-70"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {createSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setCreateSuccess(false)}>
              {m.admin_members_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setUpdateSuccess(false)}>
              {m.admin_members_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setDeleteSuccess(false)}>
              {m.admin_members_delete_success()}
            </Alert>
          )}

          {isLoading ? (
            <div className="text-center py-6">
              <Spinner label={m.admin_loading()} variant="primary" size="sm" />
            </div>
          ) : table.getPrePaginatedRowModel().rows.length === 0 ? (
            <p className="text-subtle text-center py-6 mb-0">{m.admin_members_no_results()}</p>
          ) : (
            <div className="w-full">
              <Table>
                <caption className="sr-only">{m.admin_members_table_caption()}</caption>
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
            if (!open)
              (() => {
                if (!deleting) setDeletingId(null);
              })();
          }}
        >
          <DialogContent admin size="default">
            <DialogHeader>
              <DialogTitle>{m.admin_members_delete_title()}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              {deleteError && (
                <Alert variant="danger" className="py-2 text-sm">
                  {deleteError}
                </Alert>
              )}
              <p>{m.admin_members_delete_confirm()}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingId(null)} disabled={deleting}>
                {m.admin_action_cancel()}
              </Button>
              <Button variant="danger" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    {m.admin_delete()}
                  </>
                ) : (
                  <>
                    <Icon icon={TrashIcon} className="me-1" />
                    {m.admin_members_delete_title()}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <MemberFormModal
        show={showForm}
        member={editingMember}
        onSave={handleSaveMember}
        onHide={() => {
          setShowForm(false);
          setEditingMember(null);
        }}
      />
    </>
  );
}

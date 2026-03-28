import { useState, useMemo, useCallback } from "react";
import { type FilterFn, type SortingState, type ColumnVisibilityState } from "@tanstack/react-table";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";
import {
  useAppTable,
  createAppColumnHelper,
  type AdminTableFeatures,
} from "@/hooks/useAdminTable";
import { exportToCsv } from "@/utils/csvExport";
import MemberFormModal, { type MemberFormData } from "./MemberFormModal";
import { ColumnVisibilityDropdown } from "./ColumnVisibilityDropdown";
import { loadColVis, saveColVis } from "@/utils/columnVisibility";

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
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(
    () => loadColVis(COL_VIS_KEY),
  );
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Person | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
    () => columnHelper.columns([
      columnHelper.accessor((row) => row.name, {
        id: "name",
        header: m.registration_name(),
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="fw-semibold d-flex align-items-center gap-1">
              {member.name}
              {!member.active && (
                <Badge bg="secondary" className="ms-1">
                  {m.admin_people_inactive_badge_label()}
                </Badge>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("email", {
        header: m.registration_email(),
        cell: ({ getValue }) => <span className="small">{String(getValue() ?? "") || "—"}</span>,
      }),
      columnHelper.accessor("phone", {
        header: m.registration_phone(),
        cell: ({ getValue }) => <span className="small">{String(getValue() ?? "") || "—"}</span>,
      }),
      columnHelper.accessor("clubName", {
        header: m.admin_people_club_name_label(),
        cell: ({ getValue }) => <span className="small">{String(getValue() ?? "") || "—"}</span>,
      }),
      columnHelper.accessor("notes", {
        header: m.registration_notes(),
        enableSorting: false,
        cell: ({ row }) => {
          const notes = row.original.notes;
          const preview = truncateText(notes);
          return (
            <span className="small text-secondary" title={notes || undefined}>
              {preview || "—"}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => registrationCountByPersonId[row.id] ?? 0, {
        id: "registrations",
        header: m.admin_registrations_tab(),
        cell: ({ getValue }) => <span className="small">{String(getValue())}</span>,
      }),
      columnHelper.display({
        id: "actions",
        header: m.admin_actions_label(),
        enableSorting: false,
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="d-flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline-light"
                onClick={() => {
                  setEditingMember(member);
                  setShowForm(true);
                }}
                title={m.admin_members_edit_title()}
                aria-label={m.admin_members_edit_title()}
              >
                <i className="bi bi-pencil" aria-hidden="true" />
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
                <i className="bi bi-trash" aria-hidden="true" />
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
      getRowId: (row) => row.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setQ,
      onColumnVisibilityChange: (updater) => {
        const next =
          typeof updater === "function" ? updater(columnVisibility) : updater;
        setColumnVisibility(next);
        saveColVis(COL_VIS_KEY, next);
      },
      globalFilterFn: membersGlobalFilter,
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      columnVisibility: state.columnVisibility,
    }),
  );

  const handleExportCsv = useCallback(() => {
    const rows = table.getRowModel().rows.map(({ original: member }) => ({
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
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="pb-2">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <span className="fw-semibold">{m.admin_members_tab()}</span>
            <div className="d-flex gap-2">
              <ColumnVisibilityDropdown table={table} tableId="members" />
              <Button size="sm" variant="outline-secondary" onClick={handleExportCsv} disabled={table.getRowModel().rows.length === 0}>
                <i className="bi bi-download me-1" aria-hidden="true" />
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
                <i className="bi bi-person-badge me-1" aria-hidden="true" />
                {m.admin_members_add()}
              </Button>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <Form.Select
              size="sm"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 180 }}
              aria-label={m.admin_people_active_label()}
            >
              <option value="all">{m.admin_members_filter_all()}</option>
              <option value="active">{m.admin_members_filter_active()}</option>
              <option value="inactive">{m.admin_members_filter_inactive()}</option>
            </Form.Select>
            <Form.Control
              size="sm"
              type="search"
              placeholder={m.admin_members_search_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 280 }}
            />
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {createSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setCreateSuccess(false)}
            >
              {m.admin_members_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setUpdateSuccess(false)}
            >
              {m.admin_members_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setDeleteSuccess(false)}
            >
              {m.admin_members_delete_success()}
            </Alert>
          )}

          {isLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" size="sm" />
            </div>
          ) : table.getRowModel().rows.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_members_no_results()}</p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <caption className="visually-hidden">{m.admin_members_table_caption()}</caption>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const canSort = header.column.getCanSort();
                        const sorted = header.column.getIsSorted();
                        return (
                          <th
                            key={header.id}
                            className={header.column.columnDef.meta?.tdClassName}
                            onClick={header.column.getToggleSortingHandler()}
                            onKeyDown={
                              canSort
                                ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      header.column.getToggleSortingHandler()?.(e);
                                    }
                                  }
                                : undefined
                            }
                            role={canSort ? "button" : undefined}
                            tabIndex={canSort ? 0 : undefined}
                            aria-sort={
                              canSort
                                ? sorted === "asc"
                                  ? "ascending"
                                  : sorted === "desc"
                                    ? "descending"
                                    : "none"
                                : undefined
                            }
                            style={{
                              cursor: canSort ? "pointer" : "default",
                              userSelect: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <table.FlexRender header={header} />
                            {canSort && (
                              <i
                                className={`bi ms-1 small ${
                                  sorted === "asc"
                                    ? "bi-arrow-up"
                                    : sorted === "desc"
                                      ? "bi-arrow-down"
                                      : "bi-arrow-down-up opacity-25"
                                }`}
                                aria-hidden="true"
                              />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName}>
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      {deletingId && (
        <Modal
          show
          onHide={() => {
            if (!deleting) setDeletingId(null);
          }}
          centered
          data-bs-theme="dark"
        >
          <Modal.Header closeButton className="bg-dark border-secondary">
            <Modal.Title className="fs-6 text-warning">
              {m.admin_members_delete_title()}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark">
            {deleteError && (
              <Alert variant="danger" className="py-2 small">
                {deleteError}
              </Alert>
            )}
            <p>{m.admin_members_delete_confirm()}</p>
          </Modal.Body>
          <Modal.Footer className="bg-dark border-secondary">
            <Button
              variant="outline-secondary"
              onClick={() => setDeletingId(null)}
              disabled={deleting}
            >
              {m.admin_action_cancel()}
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  {m.admin_delete()}
                </>
              ) : (
                <>
                  <i className="bi bi-trash me-1" aria-hidden="true" />
                  {m.admin_members_delete_title()}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal>
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

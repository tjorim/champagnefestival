import { useState, useMemo } from "react";
import { type FilterFn, type SortingState } from "@tanstack/react-table";
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
import VolunteerFormModal, { type VolunteerFormData } from "./VolunteerFormModal";

interface VolunteersManagementProps {
  volunteers: Person[];
  isLoading: boolean;
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
        (period.lastHelpDay ?? "").toLowerCase().includes(s),
    )
  );
};
volunteersGlobalFilter.autoRemove = (val: unknown) => !val || String(val) === "";

export default function VolunteersManagement({
  volunteers,
  isLoading,
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
    () => columnHelper.columns([
      columnHelper.accessor((row) => row.name, {
        id: "name",
        header: m.registration_name(),
        cell: ({ row }) => {
          const volunteer = row.original;
          return (
            <div className="fw-semibold d-flex align-items-center gap-1">
              {volunteer.name}
              {!volunteer.active && (
                <Badge bg="secondary" className="ms-1">
                  {m.admin_people_inactive_badge_label()}
                </Badge>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("address", {
        header: m.admin_people_address_label(),
        cell: ({ getValue }) => <span className="small">{String(getValue() ?? "")}</span>,
      }),
      columnHelper.accessor("nationalRegisterNumber", {
        header: m.admin_people_national_register_number_label(),
        enableSorting: false,
        cell: ({ getValue }) => <span className="small">{String(getValue() ?? "")}</span>,
      }),
      columnHelper.accessor("eidDocumentNumber", {
        header: m.admin_people_eid_document_number_label(),
        enableSorting: false,
        cell: ({ getValue }) => <span className="small">{String(getValue() ?? "")}</span>,
      }),
      columnHelper.display({
        id: "helpPeriods",
        header: m.admin_volunteers_help_periods_label(),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="d-flex flex-column gap-1 small">
            {row.original.helpPeriods.length > 0 ? (
              row.original.helpPeriods.map((period) => (
                <span key={period.id} className="text-secondary">
                  {formatPeriod(period)}
                </span>
              ))
            ) : (
              <span className="text-secondary">{m.admin_volunteers_no_help_periods()}</span>
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
            <div className="d-flex flex-wrap gap-1">
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
                <i className="bi bi-pencil" aria-hidden="true" />
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
                <i className="bi bi-trash" aria-hidden="true" />
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
      getRowId: (row) => row.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setQ,
      globalFilterFn: volunteersGlobalFilter,
    },
    (state) => ({ sorting: state.sorting, globalFilter: state.globalFilter }),
  );

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="pb-2">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <span className="fw-semibold">{m.admin_volunteers_tab()}</span>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={() => {
                setEditingVolunteer(null);
                setShowForm(true);
              }}
            >
              <i className="bi bi-hand-thumbs-up me-1" aria-hidden="true" />
              {m.admin_volunteers_add()}
            </Button>
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
              {m.admin_volunteers_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setUpdateSuccess(false)}
            >
              {m.admin_volunteers_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setDeleteSuccess(false)}
            >
              {m.admin_volunteers_delete_success()}
            </Alert>
          )}

          {isLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" size="sm" />
            </div>
          ) : table.getRowModel().rows.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">
              {m.admin_volunteers_no_results()}
            </p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <caption className="visually-hidden">{m.admin_volunteers_table_caption()}</caption>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className={header.column.columnDef.meta?.tdClassName}
                          onClick={header.column.getToggleSortingHandler()}
                          style={{
                            cursor: header.column.getCanSort() ? "pointer" : "default",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <table.FlexRender header={header} />
                          {header.column.getCanSort() && (
                            <i
                              className={`bi ms-1 small ${
                                header.column.getIsSorted() === "asc"
                                  ? "bi-arrow-up"
                                  : header.column.getIsSorted() === "desc"
                                    ? "bi-arrow-down"
                                    : "bi-arrow-down-up opacity-25"
                              }`}
                              aria-hidden="true"
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getAllCells().map((cell) => (
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
        <Modal show onHide={() => setDeletingId(null)} centered data-bs-theme="dark">
          <Modal.Header closeButton className="bg-dark border-secondary">
            <Modal.Title className="text-danger fs-6">
              <i className="bi bi-trash me-2" aria-hidden="true" />
              {m.admin_volunteers_delete_title()}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark text-light">
            {deleteError && <Alert variant="danger">{deleteError}</Alert>}
            <p>{m.admin_volunteers_delete_confirm()}</p>
          </Modal.Body>
          <Modal.Footer className="bg-dark border-secondary">
            <Button variant="outline-secondary" size="sm" onClick={() => setDeletingId(null)}>
              {m.admin_action_cancel()}
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? (
                <Spinner as="span" animation="border" size="sm" className="me-1" />
              ) : (
                <i className="bi bi-trash me-1" aria-hidden="true" />
              )}
              {m.admin_action_confirm()}
            </Button>
          </Modal.Footer>
        </Modal>
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

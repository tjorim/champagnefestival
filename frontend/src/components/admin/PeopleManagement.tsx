import { useState, useCallback, useMemo } from "react";
import { type FilterFn, type SortingState } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";
import { queryKeys } from "@/utils/queryKeys";
import { fetchAdminPersonRegistrations } from "@/utils/adminRegistrationApi";
import {
  useAppTable,
  createAppColumnHelper,
  type AdminTableFeatures,
} from "@/hooks/useAdminTable";
import PersonFormModal, { type PersonFormData } from "./PersonFormModal";

const columnHelper = createAppColumnHelper<Person>();

const peopleGlobalFilter: FilterFn<AdminTableFeatures, Person> = (
  row,
  _columnId,
  filterValue: string,
) => {
  const s = filterValue.toLowerCase();
  const phoneQ = s.replace(/[\s\-().+]/g, "");
  return (
    row.original.name.toLowerCase().includes(s) ||
    row.original.email.toLowerCase().includes(s) ||
    (phoneQ.length > 0 && row.original.phone.replace(/[\s\-().+]/g, "").includes(phoneQ))
  );
};
peopleGlobalFilter.autoRemove = (val: unknown) => !val || String(val) === "";

interface PeopleManagementProps {
  people: Person[];
  registrationCountByPersonId: Record<string, number>;
  isLoading: boolean;
  authHeaders: () => Record<string, string>;
  onMerge: (canonicalId: string, duplicateId: string) => Promise<void>;
  onCreate: (data: PersonFormData) => Promise<void>;
  onUpdate: (id: string, data: PersonFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface MergeState {
  canonical: Person;
  duplicate: Person;
}

export default function PeopleManagement({
  people,
  registrationCountByPersonId,
  isLoading,
  authHeaders,
  onMerge,
  onCreate,
  onUpdate,
  onDelete,
}: PeopleManagementProps) {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [viewRegistrationsPerson, setViewRegistrationsPerson] = useState<Person | null>(null);

  // Pre-filter by role; text search is handled by TanStack global filter
  const preFiltered = useMemo(
    () => (roleFilter === "all" ? people : people.filter((p) => p.roles.includes(roleFilter))),
    [people, roleFilter],
  );

  // Group people by email to surface duplicates
  const { emailGroups, duplicateEmails } = useMemo(() => {
    const groups = new Map<string, Person[]>();
    for (const p of people) {
      if (!p.email) continue;
      const key = p.email.toLowerCase();
      const group = groups.get(key) ?? [];
      group.push(p);
      groups.set(key, group);
    }
    const dupes = new Set(
      [...groups.entries()].filter(([, g]) => g.length > 1).map(([email]) => email),
    );
    return { emailGroups: groups, duplicateEmails: dupes };
  }, [people]);

  // Collect all unique roles across all people for the filter dropdown
  const allRoles = [...new Set(people.flatMap((p) => p.roles))].sort();

  const handleCopyEmails = async () => {
    if (filteredEmails.length === 0) return;
    try {
      await navigator.clipboard.writeText(filteredEmails.join(", "));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      // Clipboard API unavailable — nothing to do in this admin context
    }
  };

  const handleMergeConfirm = async () => {
    if (!mergeState) return;
    setMerging(true);
    setMergeError("");
    try {
      await onMerge(mergeState.canonical.id, mergeState.duplicate.id);
      setMergeSuccess(true);
      setMergeState(null);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : m.admin_people_merge_error());
    } finally {
      setMerging(false);
    }
  };

  const openMerge = useCallback(
    (a: Person, b: Person) => {
      // Default: keep the one with more registrations as canonical
      const aCount = registrationCountByPersonId[a.id] ?? 0;
      const bCount = registrationCountByPersonId[b.id] ?? 0;
      setMergeState({ canonical: aCount >= bCount ? a : b, duplicate: aCount >= bCount ? b : a });
      setMergeError("");
      setMergeSuccess(false);
    },
    [registrationCountByPersonId],
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
      setDeleteError(err instanceof Error ? err.message : m.admin_error_delete_person());
    } finally {
      setDeleting(false);
    }
  };

  const handleSavePerson = async (data: PersonFormData) => {
    if (editingPerson) {
      await onUpdate(editingPerson.id, data);
      setUpdateSuccess(true);
    } else {
      await onCreate(data);
      setCreateSuccess(true);
    }
  };

  const closePersonRegistrations = useCallback(() => {
    setViewRegistrationsPerson(null);
  }, []);

  const personRegistrationsQuery = useQuery({
    queryKey: queryKeys.admin.peopleRegistrations(viewRegistrationsPerson?.id ?? ""),
    queryFn: ({ signal }) =>
      fetchAdminPersonRegistrations(viewRegistrationsPerson!.id, authHeaders, signal),
    enabled: viewRegistrationsPerson !== null,
    staleTime: 30 * 1000,
    retry: false,
  });

  const personRegistrations = personRegistrationsQuery.data ?? [];
  const loadingPersonRegistrations = personRegistrationsQuery.isPending;
  const personRegistrationsError = personRegistrationsQuery.isError;

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.accessor((row) => row.name, {
        id: "name",
        header: m.registration_name(),
        cell: ({ row }) => {
          const person = row.original;
          const isDuplicate = person.email && duplicateEmails.has(person.email.toLowerCase());
          return (
            <>
              <div className="fw-semibold d-flex align-items-center gap-1">
                {person.name}
                {!person.active && (
                  <Badge bg="secondary" className="ms-1">
                    {m.admin_people_inactive_badge_label()}
                  </Badge>
                )}
              </div>
              {isDuplicate && (
                <div className="text-warning small">
                  <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
                  {m.admin_people_duplicates_same_email()}
                </div>
              )}
            </>
          );
        },
      }),
      columnHelper.accessor("email", {
        header: m.registration_email(),
        cell: ({ getValue }) => <span className="small">{String(getValue() ?? "")}</span>,
        meta: { tdClassName: "d-none d-md-table-cell" },
      }),
      columnHelper.accessor("phone", {
        header: m.registration_phone(),
        cell: ({ getValue }) => <span className="small">{String(getValue() ?? "")}</span>,
        meta: { tdClassName: "d-none d-lg-table-cell" },
      }),
      columnHelper.display({
        id: "roles",
        header: m.admin_people_roles_label(),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="d-flex flex-wrap gap-1">
            {row.original.roles.map((role) => (
              <Badge key={role} bg="secondary" className="text-capitalize">
                {role}
              </Badge>
            ))}
          </div>
        ),
        meta: { tdClassName: "d-none d-lg-table-cell" },
      }),
      columnHelper.accessor((row) => registrationCountByPersonId[row.id] ?? 0, {
        id: "registrations",
        header: m.admin_registrations_tab(),
        cell: ({ row, getValue }) => {
          const person = row.original;
          const resCount = getValue();
          return (
            <>
              <Badge
                bg={resCount > 0 ? "warning" : "secondary"}
                text={resCount > 0 ? "dark" : undefined}
              >
                {resCount}
              </Badge>
              {resCount > 0 && (
                <Button
                  size="sm"
                  variant="link"
                  className="text-secondary p-0 ms-1"
                  onClick={() => setViewRegistrationsPerson(person)}
                  title={m.admin_people_view_registrations()}
                  aria-label={`${m.admin_people_view_registrations()}: ${person.name}`}
                >
                  <i className="bi bi-eye" aria-hidden="true" />
                </Button>
              )}
            </>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: m.admin_actions_label(),
        enableSorting: false,
        cell: ({ row }) => {
          const person = row.original;
          const isDuplicate = person.email && duplicateEmails.has(person.email.toLowerCase());
          const duplicates = isDuplicate
            ? (emailGroups.get(person.email.toLowerCase()) ?? []).filter((p) => p.id !== person.id)
            : [];
          return (
            <div className="d-flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline-light"
                onClick={() => {
                  setEditingPerson(person);
                  setShowForm(true);
                }}
                title={m.admin_people_edit_title()}
                aria-label={m.admin_people_edit_title()}
              >
                <i className="bi bi-pencil" aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="outline-danger"
                onClick={() => {
                  setDeletingId(person.id);
                  setDeleteError("");
                }}
                title={m.admin_people_delete_title()}
                aria-label={m.admin_people_delete_title()}
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </Button>
              {duplicates.map((dup) => (
                <Button
                  key={dup.id}
                  size="sm"
                  variant="outline-warning"
                  onClick={() => openMerge(person, dup)}
                  title={`${m.admin_people_merge_title()}: ${dup.name}`}
                >
                  <i className="bi bi-person-fill-gear me-1" aria-hidden="true" />
                  {m.admin_people_merge_title()}
                </Button>
              ))}
            </div>
          );
        },
      }),
    ]),
    [
      duplicateEmails,
      emailGroups,
      registrationCountByPersonId,
      setEditingPerson,
      setShowForm,
      setDeletingId,
      setDeleteError,
      setViewRegistrationsPerson,
      openMerge,
    ],
  );

  const table = useAppTable(
    {
      data: preFiltered,
      columns,
      state: { sorting, globalFilter: q },
      getRowId: (row) => row.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setQ,
      globalFilterFn: peopleGlobalFilter,
    },
    (state) => ({ sorting: state.sorting, globalFilter: state.globalFilter }),
  );

  // Emails from the currently visible (filtered + searched) rows for the copy button
  const filteredEmails = table
    .getFilteredRowModel()
    .rows.map((row) => row.original.email)
    .filter(Boolean);

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="pb-2">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <span className="fw-semibold">{m.admin_people_tab()}</span>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={() => {
                setEditingPerson(null);
                setShowForm(true);
              }}
            >
              <i className="bi bi-person-plus me-1" aria-hidden="true" />
              {m.admin_people_add_person()}
            </Button>
          </div>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <Form.Select
              size="sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 160 }}
              aria-label={m.admin_people_roles_label()}
            >
              <option value="all">{m.admin_people_all_roles()}</option>
              {allRoles.map((role) => (
                <option key={role} value={role} className="text-capitalize">
                  {role}
                </option>
              ))}
            </Form.Select>
            <Button
              size="sm"
              variant={copySuccess ? "success" : "outline-secondary"}
              onClick={handleCopyEmails}
              disabled={filteredEmails.length === 0}
              title={m.admin_people_copy_emails_tooltip()}
              aria-label={`${m.admin_people_copy_emails_tooltip()} (${filteredEmails.length})`}
            >
              <i
                className={`bi ${copySuccess ? "bi-check2" : "bi-clipboard-fill"} me-1`}
                aria-hidden="true"
              />
              {copySuccess ? m.admin_people_emails_copied() : `${filteredEmails.length}`}
            </Button>
            <Form.Control
              size="sm"
              type="search"
              placeholder={m.admin_search_person_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 240 }}
            />
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {mergeSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setMergeSuccess(false)}
            >
              {m.admin_people_merge_success()}
            </Alert>
          )}
          {createSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setCreateSuccess(false)}
            >
              {m.admin_people_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setUpdateSuccess(false)}
            >
              {m.admin_people_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setDeleteSuccess(false)}
            >
              {m.admin_people_delete_success()}
            </Alert>
          )}

          {isLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" size="sm" />
            </div>
          ) : table.getRowModel().rows.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_people_no_results()}</p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
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

      {mergeState && (
        <Modal show onHide={() => setMergeState(null)} centered aria-labelledby="merge-modal-title">
          <Modal.Header closeButton className="bg-dark text-light border-secondary">
            <Modal.Title id="merge-modal-title">
              <i className="bi bi-person-fill-gear me-2" aria-hidden="true" />
              {m.admin_people_merge_title()}
            </Modal.Title>
          </Modal.Header>

          <Modal.Body className="bg-dark text-light">
            {mergeError && <Alert variant="danger">{mergeError}</Alert>}

            <p className="text-secondary small mb-3">{m.admin_people_duplicates_same_email()}</p>

            {(["canonical", "duplicate"] as const).map((role) => {
              const person = mergeState[role];
              const resCount = registrationCountByPersonId[person.id] ?? 0;
              const label =
                role === "canonical" ? m.admin_people_merge_into() : m.admin_people_merge_discard();
              const variant = role === "canonical" ? "success" : "danger";

              return (
                <Card key={role} bg="dark" border={variant} className="mb-3">
                  <Card.Header
                    className={`border-${variant} text-${variant} small fw-semibold d-flex justify-content-between`}
                  >
                    <span>{label}</span>
                    <Button
                      size="sm"
                      variant={`outline-${variant}`}
                      aria-label={m.admin_people_merge_swap_label()}
                      title={m.admin_people_merge_swap_label()}
                      onClick={() =>
                        setMergeState({
                          canonical: mergeState.duplicate,
                          duplicate: mergeState.canonical,
                        })
                      }
                    >
                      <i className="bi bi-arrow-left-right" aria-hidden="true" />
                    </Button>
                  </Card.Header>
                  <Card.Body className="py-2 small">
                    <div className="fw-semibold">{person.name}</div>
                    <div className="text-secondary">{person.email}</div>
                    {person.phone && <div className="text-secondary">{person.phone}</div>}
                    <div className="mt-1">
                      <Badge
                        bg={resCount > 0 ? "warning" : "secondary"}
                        text={resCount > 0 ? "dark" : undefined}
                      >
                        {resCount} {m.admin_people_registrations_count()}
                      </Badge>
                      {person.roles.map((r) => (
                        <Badge key={r} bg="secondary" className="ms-1 text-capitalize">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </Card.Body>
                </Card>
              );
            })}
          </Modal.Body>

          <Modal.Footer className="bg-dark border-secondary">
            <Button variant="outline-secondary" onClick={() => setMergeState(null)}>
              {m.close()}
            </Button>
            <Button variant="warning" onClick={handleMergeConfirm} disabled={merging}>
              {merging ? (
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
              ) : (
                <>
                  <i className="bi bi-person-fill-gear me-1" aria-hidden="true" />
                  {m.admin_people_merge_confirm()}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deletingId && (
        <Modal show onHide={() => setDeletingId(null)} centered data-bs-theme="dark">
          <Modal.Header closeButton className="bg-dark border-secondary">
            <Modal.Title className="text-danger fs-6">
              <i className="bi bi-trash me-2" aria-hidden="true" />
              {m.admin_people_delete_title()}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark text-light">
            {deleteError && <Alert variant="danger">{deleteError}</Alert>}
            <p>{m.admin_people_delete_confirm()}</p>
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

      {/* Create / edit person modal */}
      <PersonFormModal
        show={showForm}
        person={editingPerson}
        onSave={handleSavePerson}
        onHide={() => {
          setShowForm(false);
          setEditingPerson(null);
        }}
      />

      {/* Person registrations modal */}
      {viewRegistrationsPerson && (
        <Modal show onHide={closePersonRegistrations} centered data-bs-theme="dark">
          <Modal.Header closeButton className="bg-dark border-secondary">
            <Modal.Title className="text-warning fs-6">
              <i className="bi bi-calendar-check me-2" aria-hidden="true" />
              {m.admin_people_registrations_modal_title()} — {viewRegistrationsPerson.name}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark text-light p-0">
            {loadingPersonRegistrations && (
              <div className="text-center py-4">
                <Spinner animation="border" size="sm" variant="warning" />
              </div>
            )}
            {!loadingPersonRegistrations && personRegistrationsError && (
              <Alert variant="danger" className="m-3">
                {m.admin_people_registrations_load_error()}
              </Alert>
            )}
            {!loadingPersonRegistrations &&
              !personRegistrationsError &&
              personRegistrations.length === 0 && (
                <p className="text-secondary text-center py-4 mb-0">
                  {m.admin_people_registrations_empty()}
                </p>
              )}
            {!loadingPersonRegistrations &&
              !personRegistrationsError &&
              personRegistrations.length > 0 && (
                <ListGroup variant="flush">
                  {personRegistrations.map((r) => (
                    <ListGroup.Item key={r.id} className="bg-dark border-secondary text-light py-2">
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <div className="fw-semibold small">{r.eventTitle}</div>
                          <div className="text-secondary small">
                            <i className="bi bi-people me-1" aria-hidden="true" />
                            {r.guestCount}
                          </div>
                        </div>
                        <div className="d-flex gap-1 flex-wrap justify-content-end">
                          <Badge
                            bg={
                              r.status === "confirmed"
                                ? "success"
                                : r.status === "cancelled"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {r.status === "confirmed"
                              ? m.admin_status_confirmed()
                              : r.status === "cancelled"
                                ? m.admin_status_cancelled()
                                : m.admin_status_pending()}
                          </Badge>
                          <Badge
                            bg={
                              r.paymentStatus === "paid"
                                ? "success"
                                : r.paymentStatus === "partial"
                                  ? "warning"
                                  : "secondary"
                            }
                          >
                            {r.paymentStatus === "paid"
                              ? m.admin_payment_paid()
                              : r.paymentStatus === "partial"
                                ? m.admin_payment_partial()
                                : m.admin_payment_unpaid()}
                          </Badge>
                          {r.checkedIn && (
                            <Badge bg="success">
                              <i className="bi bi-check2-circle me-1" aria-hidden="true" />
                              {m.admin_checked_in()}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-secondary" style={{ fontSize: "0.7rem" }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}
          </Modal.Body>
          <Modal.Footer className="bg-dark border-secondary">
            <Button variant="outline-secondary" size="sm" onClick={closePersonRegistrations}>
              {m.close()}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}

import {
  ArrowLeftRightIcon,
  CalendarCheckIcon,
  CheckIcon,
  CircleCheckIcon,
  ClipboardIcon,
  EyeIcon,
  FileSpreadsheetIcon,
  MailIcon,
  NotebookTextIcon,
  PencilIcon,
  TrashIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  UserRoundCogIcon,
  UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { AdminSortableHeader } from "./AdminSortableHeader";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  type FilterFn,
  type SortingState,
  type ColumnVisibilityState,
} from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Form from "react-bootstrap/Form";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
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
import { queryKeys } from "@/utils/queryKeys";
import {
  fetchAdminPersonRegistrations,
  fetchPersonPaymentSummary,
} from "@/utils/adminRegistrationApi";
import {
  fetchPeopleSearch,
  downloadPaymentTransactionsCsv,
  fetchPaymentTransactionsLedger,
  LEDGER_PAGE_SIZE,
} from "@/utils/adminFetch";
import { devError } from "@/utils/devLog";
import { useAppTable, createAppColumnHelper, type AdminTableFeatures } from "@/hooks/useAdminTable";
import { AdminTablePagination } from "./AdminTablePagination";
import PersonFormModal, { type PersonFormData } from "./PersonFormModal";
import { ColumnVisibilityDropdown } from "./ColumnVisibilityDropdown";
import LedgerModal, { LEDGER_SORT_KEY_BY_COLUMN } from "./LedgerModal";
import { loadColVis, saveColVis } from "@/utils/columnVisibility";
import { buildMemberEmailDraft, type EmailDraft } from "@/utils/emailComposer";
import EmailComposeModal from "./EmailComposeModal";

const COL_VIS_KEY = "admin-col-vis-people";

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
  const [debouncedQ, setDebouncedQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() =>
    loadColVis(COL_VIS_KEY),
  );
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
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [exportingLedger, setExportingLedger] = useState(false);
  const [ledgerExportError, setLedgerExportError] = useState("");
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSorting, setLedgerSorting] = useState<SortingState>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);
  const peopleSearchQuery = useQuery({
    queryKey: ["admin", "people", "search", debouncedQ],
    queryFn: () => fetchPeopleSearch(authHeaders, debouncedQ),
    enabled: debouncedQ.length > 0,
    staleTime: 30 * 1000,
    retry: false,
  });
  const displayedPeople = useMemo(
    () => (debouncedQ ? (peopleSearchQuery.data ?? []) : people),
    [debouncedQ, people, peopleSearchQuery.data],
  );

  const preFiltered = useMemo(
    () =>
      roleFilter === "all"
        ? displayedPeople
        : displayedPeople.filter((p) => p.roles.includes(roleFilter)),
    [displayedPeople, roleFilter],
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
    setLedgerExportError("");
    setShowLedgerModal(false);
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

  const personPaymentSummaryQuery = useQuery({
    queryKey: queryKeys.admin.peoplePaymentSummary(viewRegistrationsPerson?.id ?? ""),
    queryFn: ({ signal }) =>
      fetchPersonPaymentSummary(viewRegistrationsPerson!.id, authHeaders, signal),
    enabled: viewRegistrationsPerson !== null,
    staleTime: 30 * 1000,
    retry: false,
  });
  const personPaymentSummary = personPaymentSummaryQuery.data ?? null;

  const ledgerActiveSort = ledgerSorting[0];
  const ledgerBackendSort = ledgerActiveSort
    ? LEDGER_SORT_KEY_BY_COLUMN[ledgerActiveSort.id]
    : undefined;
  const ledgerBackendSortDir: "asc" | "desc" = ledgerActiveSort?.desc ? "desc" : "asc";

  const personLedgerQuery = useQuery({
    queryKey: queryKeys.admin.paymentTransactionsLedger({
      personId: viewRegistrationsPerson?.id ?? "",
      sort: ledgerBackendSort,
      sortDir: ledgerBackendSort ? ledgerBackendSortDir : undefined,
      page: ledgerPage,
    }),
    queryFn: () =>
      fetchPaymentTransactionsLedger(authHeaders, {
        personId: viewRegistrationsPerson!.id,
        sort: ledgerBackendSort,
        sortDir: ledgerBackendSort ? ledgerBackendSortDir : undefined,
        page: ledgerPage,
      }),
    enabled: showLedgerModal && viewRegistrationsPerson !== null,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    retry: false,
  });

  const handleExportLedger = useCallback(async () => {
    if (!viewRegistrationsPerson) return;
    setLedgerExportError("");
    setExportingLedger(true);
    try {
      await downloadPaymentTransactionsCsv(authHeaders, { personId: viewRegistrationsPerson.id });
    } catch (err) {
      devError("Failed to export payment ledger", err);
      setLedgerExportError(
        err instanceof Error ? err.message : m.admin_people_export_ledger_error(),
      );
    } finally {
      setExportingLedger(false);
    }
  }, [authHeaders, viewRegistrationsPerson]);
  const personPaymentTotals = useMemo(() => {
    const nonCancelled = (personRegistrationsQuery.data ?? []).filter(
      (r) => r.status !== "cancelled",
    );
    const byEdition = new Map<string, { label: string; totalPaid: number }>();
    for (const r of nonCancelled) {
      const key = r.editionId || r.editionLabel || "?";
      const existing = byEdition.get(key);
      byEdition.set(key, {
        label: r.editionLabel || key,
        totalPaid: (existing?.totalPaid ?? 0) + r.amountPaid,
      });
    }
    return {
      grandTotal: nonCancelled.reduce((sum, r) => sum + r.amountPaid, 0),
      // Traceable to each booking's own amount_due/amount_paid (#1019), which
      // in turn derive from that booking's payment ledger.
      outstandingTotal: nonCancelled.reduce(
        (sum, r) => sum + Math.max(0, (r.amountDue ?? 0) - r.amountPaid),
        0,
      ),
      byEdition: [...byEdition.values()],
    };
  }, [personRegistrationsQuery.data]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((row) => row.name, {
          id: "name",
          header: m.registration_name(),
          cell: ({ row }) => {
            const person = row.original;
            const isDuplicate = person.email && duplicateEmails.has(person.email.toLowerCase());
            return (
              <>
                <div className="tw:font-semibold tw:flex tw:items-center tw:gap-1">
                  {person.name}
                  {!person.active && (
                    <Badge bg="secondary" className="tw:ms-1">
                      {m.admin_people_inactive_badge_label()}
                    </Badge>
                  )}
                </div>
                {isDuplicate && (
                  <div className="tw:text-highlight tw:text-sm">
                    <Icon icon={TriangleAlertIcon} className="tw:me-1" />
                    {m.admin_people_duplicates_same_email()}
                  </div>
                )}
              </>
            );
          },
        }),
        columnHelper.accessor("email", {
          header: m.registration_email(),
          cell: ({ getValue }) => <span className="tw:text-sm">{String(getValue() ?? "")}</span>,
          meta: { tdClassName: "tw:hidden tw:md:table-cell" },
        }),
        columnHelper.accessor("phone", {
          header: m.registration_phone(),
          cell: ({ getValue }) => <span className="tw:text-sm">{String(getValue() ?? "")}</span>,
          meta: { tdClassName: "tw:hidden tw:lg:table-cell" },
        }),
        columnHelper.display({
          id: "roles",
          header: m.admin_people_roles_label(),
          enableSorting: false,
          cell: ({ row }) => (
            <div className="tw:flex tw:flex-wrap tw:gap-1">
              {row.original.roles.map((role) => (
                <Badge key={role} bg="secondary" className="tw:capitalize">
                  {role}
                </Badge>
              ))}
            </div>
          ),
          meta: { tdClassName: "tw:hidden tw:lg:table-cell" },
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
                    className="tw:text-subtle tw:p-0 tw:ms-1"
                    onClick={() => setViewRegistrationsPerson(person)}
                    title={m.admin_people_view_registrations()}
                    aria-label={`${m.admin_people_view_registrations()}: ${person.name}`}
                  >
                    <Icon icon={EyeIcon} />
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
              ? (emailGroups.get(person.email.toLowerCase()) ?? []).filter(
                  (p) => p.id !== person.id,
                )
              : [];
            return (
              <div className="tw:flex tw:flex-wrap tw:gap-1">
                {person.email && (
                  <Button
                    size="sm"
                    variant="outline-warning"
                    onClick={() =>
                      setEmailDraft(
                        buildMemberEmailDraft(
                          person.name,
                          person.email,
                          person.preferredLanguage ?? "nl",
                        ),
                      )
                    }
                    title={m.admin_email_compose_for({ name: person.name })}
                    aria-label={m.admin_email_compose_for({ name: person.name })}
                  >
                    <Icon icon={MailIcon} />
                  </Button>
                )}
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
                  <Icon icon={PencilIcon} />
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
                  <Icon icon={TrashIcon} />
                </Button>
                {duplicates.map((dup) => (
                  <Button
                    key={dup.id}
                    size="sm"
                    variant="outline-warning"
                    onClick={() => openMerge(person, dup)}
                    title={`${m.admin_people_merge_title()}: ${dup.name}`}
                  >
                    <Icon icon={UserRoundCogIcon} className="tw:me-1" />
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
      state: { sorting, globalFilter: debouncedQ ? "" : q, columnVisibility },
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
      globalFilterFn: peopleGlobalFilter,
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      columnVisibility: state.columnVisibility,
      pagination: state.pagination,
    }),
  );

  // Emails from the currently visible (filtered + searched) rows for the copy button
  const filteredEmails = table
    .getFilteredRowModel()
    .rows.map((row) => row.original.email)
    .filter(Boolean);

  return (
    <>
      <EmailComposeModal draft={emailDraft} onClose={() => setEmailDraft(null)} />
      <Card tone="secondary">
        <CardHeader className="tw:pb-2">
          <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:mb-2">
            <span className="tw:font-semibold">{m.admin_people_tab()}</span>
            <div className="tw:flex tw:gap-2">
              <ColumnVisibilityDropdown table={table} tableId="people" />
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => {
                  setEditingPerson(null);
                  setShowForm(true);
                }}
              >
                <Icon icon={UserPlusIcon} className="tw:me-1" />
                {m.admin_people_add_person()}
              </Button>
            </div>
          </div>
          <div className="tw:flex tw:flex-wrap tw:gap-2 tw:items-center">
            <Form.Select
              size="sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-dark tw:text-content border-secondary"
              style={{ maxWidth: 160 }}
              aria-label={m.admin_people_roles_label()}
            >
              <option value="all">{m.admin_people_all_roles()}</option>
              {allRoles.map((role) => (
                <option key={role} value={role} className="tw:capitalize">
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
              <Icon icon={copySuccess ? CheckIcon : ClipboardIcon} className="tw:me-1" />
              {copySuccess ? m.admin_people_emails_copied() : `${filteredEmails.length}`}
            </Button>
            <Form.Control
              size="sm"
              type="search"
              placeholder={m.admin_search_person_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-dark tw:text-content border-secondary"
              style={{ maxWidth: 240 }}
            />
          </div>
        </CardHeader>

        <CardContent className="tw:p-0">
          {mergeSuccess && (
            <Alert
              role="status"
              aria-live="polite"
              variant="success"
              dismissible
              className="tw:m-4 tw:mb-0"
              onClose={() => setMergeSuccess(false)}
            >
              {m.admin_people_merge_success()}
            </Alert>
          )}
          {createSuccess && (
            <Alert
              role="status"
              aria-live="polite"
              variant="success"
              dismissible
              className="tw:m-4 tw:mb-0"
              onClose={() => setCreateSuccess(false)}
            >
              {m.admin_people_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert
              role="status"
              aria-live="polite"
              variant="success"
              dismissible
              className="tw:m-4 tw:mb-0"
              onClose={() => setUpdateSuccess(false)}
            >
              {m.admin_people_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert
              role="status"
              aria-live="polite"
              variant="success"
              dismissible
              className="tw:m-4 tw:mb-0"
              onClose={() => setDeleteSuccess(false)}
            >
              {m.admin_people_delete_success()}
            </Alert>
          )}

          {isLoading || peopleSearchQuery.isLoading ? (
            <div className="tw:text-center tw:py-6">
              <Spinner animation="border" variant="primary" size="sm" />
            </div>
          ) : peopleSearchQuery.isError ? (
            <p className="tw:text-destructive tw:text-center tw:py-6 tw:mb-0">
              {m.admin_error_load_data()}
            </p>
          ) : table.getPrePaginatedRowModel().rows.length === 0 ? (
            <p className="tw:text-subtle tw:text-center tw:py-6 tw:mb-0">
              {m.admin_people_no_results()}
            </p>
          ) : (
            <div data-tailwind-migrated="true" className="tw:w-full">
              <Table>
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

      {mergeState && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setMergeState(null);
          }}
        >
          <DialogContent admin size="default">
            <DialogHeader>
              <DialogTitle id="merge-modal-title">
                <Icon icon={UserRoundCogIcon} className="tw:me-2" />
                {m.admin_people_merge_title()}
              </DialogTitle>
            </DialogHeader>

            <DialogBody>
              {mergeError && (
                <Alert role="alert" aria-live="assertive" variant="danger">
                  {mergeError}
                </Alert>
              )}

              <p className="tw:text-subtle tw:text-sm tw:mb-4">
                {m.admin_people_duplicates_same_email()}
              </p>

              {(["canonical", "duplicate"] as const).map((role) => {
                const person = mergeState[role];
                const resCount = registrationCountByPersonId[person.id] ?? 0;
                const label =
                  role === "canonical"
                    ? m.admin_people_merge_into()
                    : m.admin_people_merge_discard();
                const variant = role === "canonical" ? "success" : "danger";

                return (
                  <Card key={role} tone={variant} className="tw:mb-4">
                    <CardHeader
                      className={`border-${variant} text-${variant} tw:text-sm tw:font-semibold tw:flex tw:justify-between`}
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
                        <Icon icon={ArrowLeftRightIcon} />
                      </Button>
                    </CardHeader>
                    <CardContent className="tw:py-2 tw:text-sm">
                      <div className="tw:font-semibold">{person.name}</div>
                      <div className="tw:text-subtle">{person.email}</div>
                      {person.phone && <div className="tw:text-subtle">{person.phone}</div>}
                      <div className="tw:mt-1">
                        <Badge
                          bg={resCount > 0 ? "warning" : "secondary"}
                          text={resCount > 0 ? "dark" : undefined}
                        >
                          {resCount} {m.admin_people_registrations_count()}
                        </Badge>
                        {person.roles.map((r) => (
                          <Badge key={r} bg="secondary" className="tw:ms-1 tw:capitalize">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </DialogBody>

            <DialogFooter>
              <Button variant="outline-secondary" onClick={() => setMergeState(null)}>
                {m.close()}
              </Button>
              <Button variant="warning" onClick={handleMergeConfirm} disabled={merging}>
                {merging ? (
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                  />
                ) : (
                  <>
                    <Icon icon={UserRoundCogIcon} className="tw:me-1" />
                    {m.admin_people_merge_confirm()}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm modal */}
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
                {m.admin_people_delete_title()}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              {deleteError && (
                <Alert role="alert" aria-live="assertive" variant="danger">
                  {deleteError}
                </Alert>
              )}
              <p>{m.admin_people_delete_confirm()}</p>
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
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) closePersonRegistrations();
          }}
        >
          <DialogContent admin size="default">
            <DialogHeader>
              <DialogTitle>
                <Icon icon={CalendarCheckIcon} className="tw:me-2" />
                {m.admin_people_registrations_modal_title()} — {viewRegistrationsPerson.name}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="tw:p-0">
              {loadingPersonRegistrations && (
                <div className="tw:text-center tw:py-6">
                  <Spinner animation="border" size="sm" variant="warning" />
                </div>
              )}
              {!loadingPersonRegistrations && personRegistrationsError && (
                <Alert role="alert" aria-live="assertive" variant="danger" className="tw:m-4">
                  {m.admin_people_registrations_load_error()}
                </Alert>
              )}
              {!loadingPersonRegistrations &&
                !personRegistrationsError &&
                personRegistrations.length === 0 && (
                  <p className="tw:text-subtle tw:text-center tw:py-6 tw:mb-0">
                    {m.admin_people_registrations_empty()}
                  </p>
                )}
              {!loadingPersonRegistrations &&
                !personRegistrationsError &&
                personRegistrations.length > 0 && (
                  <div className="tw:px-4 tw:pt-4 tw:text-sm tw:text-subtle">
                    <div>
                      {m.admin_people_total_paid({
                        amount: personPaymentTotals.grandTotal.toFixed(2),
                      })}
                    </div>
                    <div>
                      {m.admin_people_total_outstanding({
                        amount: personPaymentTotals.outstandingTotal.toFixed(2),
                      })}
                    </div>
                    {personPaymentSummary && (
                      <>
                        <div>
                          {m.admin_people_total_received({
                            amount: personPaymentSummary.received.toFixed(2),
                          })}
                        </div>
                        <div>
                          {m.admin_people_total_refunded({
                            amount: personPaymentSummary.refunded.toFixed(2),
                          })}
                        </div>
                      </>
                    )}
                    {personPaymentTotals.byEdition.length > 1 &&
                      personPaymentTotals.byEdition.map((edition) => (
                        <div key={edition.label} className="tw:ms-2">
                          {edition.label}: €{edition.totalPaid.toFixed(2)}
                        </div>
                      ))}
                  </div>
                )}
              {!loadingPersonRegistrations &&
                !personRegistrationsError &&
                personRegistrations.length > 0 && (
                  <PresentationList flush>
                    {personRegistrations.map((r) => (
                      <PresentationListItem key={r.id} className="tw:py-2">
                        <div className="tw:flex tw:justify-between tw:items-start tw:gap-2">
                          <div>
                            <div className="tw:font-semibold tw:text-sm">{r.eventTitle}</div>
                            <div className="tw:text-subtle tw:text-sm">
                              <Icon icon={UsersIcon} className="tw:me-1" />
                              {r.guestCount}
                              <span className="tw:ms-2">€{r.amountPaid.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="tw:flex tw:gap-1 tw:flex-wrap tw:justify-end">
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
                                <Icon icon={CircleCheckIcon} className="tw:me-1" />
                                {m.admin_checked_in()}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="tw:text-subtle" style={{ fontSize: "0.7rem" }}>
                          {new Date(r.createdAt).toLocaleDateString()}
                        </div>
                      </PresentationListItem>
                    ))}
                  </PresentationList>
                )}
            </DialogBody>
            <DialogFooter className="tw:flex-col tw:items-stretch">
              {ledgerExportError && (
                <Alert
                  role="alert"
                  aria-live="assertive"
                  variant="danger"
                  className="tw:py-2 tw:mb-2"
                >
                  {ledgerExportError}
                </Alert>
              )}
              <div className="tw:flex tw:justify-between tw:gap-2">
                <div className="tw:flex tw:gap-2">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    disabled={personRegistrations.length === 0}
                    onClick={() => {
                      setLedgerPage(1);
                      setLedgerSorting([]);
                      setShowLedgerModal(true);
                    }}
                    title={m.admin_payment_view_ledger()}
                  >
                    <Icon icon={NotebookTextIcon} className="tw:me-1" />
                    {m.admin_payment_view_ledger()}
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    disabled={exportingLedger || personRegistrations.length === 0}
                    onClick={() => void handleExportLedger()}
                    title={m.admin_people_export_ledger()}
                  >
                    {exportingLedger ? (
                      <Spinner as="span" animation="border" size="sm" className="tw:me-1" />
                    ) : (
                      <Icon icon={FileSpreadsheetIcon} className="tw:me-1" />
                    )}
                    {m.admin_people_export_ledger()}
                  </Button>
                </div>
                <Button variant="outline-secondary" size="sm" onClick={closePersonRegistrations}>
                  {m.close()}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {viewRegistrationsPerson && (
        <LedgerModal
          show={showLedgerModal}
          title={`${m.admin_ledger_modal_title()} — ${viewRegistrationsPerson.name}`}
          transactions={personLedgerQuery.data?.transactions ?? []}
          total={personLedgerQuery.data?.total ?? 0}
          limit={personLedgerQuery.data?.limit ?? LEDGER_PAGE_SIZE}
          loading={personLedgerQuery.isPending}
          isFetching={personLedgerQuery.isFetching}
          error={personLedgerQuery.isError}
          showPerson={false}
          page={ledgerPage}
          sorting={ledgerSorting}
          onSortingChange={(updater) => {
            const next = typeof updater === "function" ? updater(ledgerSorting) : updater;
            setLedgerSorting(next);
            setLedgerPage(1);
          }}
          onPreviousPage={() => setLedgerPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setLedgerPage((p) => p + 1)}
          onHide={() => setShowLedgerModal(false)}
        />
      )}
    </>
  );
}

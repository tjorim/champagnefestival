import { formatNumber } from "@/lib/format/numberUtils";
import { getLocale } from "@/paraglide/runtime";
import { editionDisplayName } from "@/lib/editions/editionName";
import { RowActionButton, RowActions } from "@/components/admin/RowActions";
import { PersonDuplicates } from "../PersonDuplicates";
import { PersonName } from "../PeopleDataTable";
import { Button } from "@/components/ui/button";
import { EyeIcon, ShieldCheckIcon, MailIcon, PencilIcon, TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useState, useCallback, useMemo } from "react";
import { type SortingState } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Person } from "@/types/person";
import { queryKeys } from "@/lib/query/queryKeys";
import {
  fetchAdminPersonRegistrations,
  fetchPersonPaymentSummary,
} from "../../shared/adminRegistrationApi";
import {
  downloadPaymentTransactionsCsv,
  fetchPaymentTransactionsLedger,
} from "@/lib/api/adminFetch";
import { devError } from "@/lib/devLog";
import { createAppColumnHelper } from "../../shared/useAdminTable";
import { type PersonFormData } from "../PersonFormModal";
import { LEDGER_SORT_KEY_BY_COLUMN } from "../../shared/LedgerModal";
import { buildMemberEmailDraft, type EmailDraft } from "../../shared/emailComposer";

const columnHelper = createAppColumnHelper<Person>();

export interface PeopleManagementProps {
  onMerge: (canonicalId: string, duplicateId: string) => Promise<void>;
  onCreate: (data: PersonFormData) => Promise<void>;
  onUpdate: (id: string, data: PersonFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface MergeState {
  canonical: Person;
  duplicate: Person;
}

/** The people list's dialogs, merge/delete flows, per-person registrations and ledger, and table columns. */
export function usePeopleManagement({
  onMerge,
  onCreate,
  onUpdate,
  onDelete,
}: PeopleManagementProps) {
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [viewRegistrationsPerson, setViewRegistrationsPerson] = useState<Person | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [consentPerson, setConsentPerson] = useState<Person | null>(null);
  const [exportingLedger, setExportingLedger] = useState(false);
  const [ledgerExportError, setLedgerExportError] = useState("");
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSorting, setLedgerSorting] = useState<SortingState>([]);

  const handleMergeConfirm = async () => {
    if (!mergeState) return;
    setMerging(true);
    setMergeError("");
    try {
      await onMerge(mergeState.canonical.id, mergeState.duplicate.id);
      setMergeSuccess(true);
      setMergeState(null);
    } catch (err) {
      setMergeError(apiErrorMessage(err, m.admin_people_merge_error()));
    } finally {
      setMerging(false);
    }
  };

  const openMerge = useCallback((a: Person, b: Person) => {
    // Default: keep the one with more registrations as canonical
    const aCount = a.registration_count ?? 0;
    const bCount = b.registration_count ?? 0;
    setMergeState({ canonical: aCount >= bCount ? a : b, duplicate: aCount >= bCount ? b : a });
    setMergeError("");
    setMergeSuccess(false);
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deletingPerson) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(deletingPerson.id);
      setDeleteSuccess(true);
      setDeletingPerson(null);
    } catch (err) {
      setDeleteError(apiErrorMessage(err, m.admin_error_delete_person()));
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
    queryFn: ({ signal }) => fetchAdminPersonRegistrations(viewRegistrationsPerson!.id, signal),
    enabled: viewRegistrationsPerson !== null,
    staleTime: 30 * 1000,
    retry: false,
  });

  const personRegistrations = personRegistrationsQuery.data ?? [];
  const loadingPersonRegistrations = personRegistrationsQuery.isPending;
  const personRegistrationsError = personRegistrationsQuery.isError;

  const personPaymentSummaryQuery = useQuery({
    queryKey: queryKeys.admin.peoplePaymentSummary(viewRegistrationsPerson?.id ?? ""),
    queryFn: ({ signal }) => fetchPersonPaymentSummary(viewRegistrationsPerson!.id, signal),
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
      fetchPaymentTransactionsLedger({
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
      await downloadPaymentTransactionsCsv({ personId: viewRegistrationsPerson.id });
    } catch (err) {
      devError("Failed to export payment ledger", err);
      setLedgerExportError(apiErrorMessage(err, m.admin_people_export_ledger_error()));
    } finally {
      setExportingLedger(false);
    }
  }, [viewRegistrationsPerson]);
  const personPaymentTotals = useMemo(() => {
    const nonCancelled = (personRegistrationsQuery.data ?? []).filter(
      (r) => r.status !== "cancelled",
    );
    const byEdition = new Map<string, { label: string; totalPaid: number }>();
    for (const r of nonCancelled) {
      const key =
        r.event.edition_id || (r.event.edition ? editionDisplayName(r.event.edition) : "") || "?";
      const existing = byEdition.get(key);
      byEdition.set(key, {
        label: (r.event.edition ? editionDisplayName(r.event.edition) : "") || key,
        totalPaid: (existing?.totalPaid ?? 0) + Number(r.amount_paid),
      });
    }
    return {
      grandTotal: nonCancelled.reduce((sum, r) => sum + Number(r.amount_paid), 0),
      // Traceable to each booking's own amount_due/amount_paid (#1019), which
      // in turn derive from that booking's payment ledger.
      outstandingTotal: nonCancelled.reduce(
        (sum, r) =>
          sum +
          Math.max(
            0,
            ((r.amount_due === null ? null : Number(r.amount_due)) ?? 0) - Number(r.amount_paid),
          ),
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
            return (
              <>
                <PersonName person={person} />
              </>
            );
          },
        }),
        columnHelper.accessor("email", {
          header: m.registration_email(),
          cell: ({ getValue }) => <span className="text-sm">{String(getValue() ?? "")}</span>,
          meta: { tdClassName: "hidden md:table-cell" },
        }),
        columnHelper.accessor("phone", {
          enableSorting: false,
          header: m.registration_phone(),
          cell: ({ getValue }) => <span className="text-sm">{String(getValue() ?? "")}</span>,
          meta: { tdClassName: "hidden lg:table-cell" },
        }),
        columnHelper.display({
          id: "roles",
          header: m.admin_people_roles_label(),
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex flex-wrap gap-1">
              {(row.original.roles ?? []).map((role) => (
                <Badge key={role} variant="secondary" className="capitalize">
                  {role}
                </Badge>
              ))}
            </div>
          ),
          meta: { tdClassName: "hidden lg:table-cell" },
        }),
        columnHelper.accessor((row) => row.registration_count ?? 0, {
          id: "registrations",
          header: m.admin_registrations_tab(),
          cell: ({ row, getValue }) => {
            const person = row.original;
            const resCount = getValue();
            return (
              <>
                <Badge variant={resCount > 0 ? "warning" : "secondary"}>
                  {formatNumber(resCount, getLocale())}
                </Badge>
                {resCount > 0 && (
                  <Button
                    size="sm"
                    variant="link"
                    className="text-subtle p-0 ms-1"
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
            return (
              <RowActions
                destructive={
                  <RowActionButton
                    destructive
                    icon={TrashIcon}
                    label={m.admin_delete_item({ name: person.name })}
                    onClick={() => {
                      setDeletingPerson(person);
                      setDeleteError("");
                    }}
                  />
                }
              >
                {person.email && (
                  <RowActionButton
                    icon={MailIcon}
                    label={m.admin_email_compose_for({ name: person.name })}
                    onClick={() =>
                      setEmailDraft(
                        buildMemberEmailDraft(
                          person.name,
                          person.email ?? "",
                          person.preferred_language ?? "nl",
                        ),
                      )
                    }
                  />
                )}
                <RowActionButton
                  icon={ShieldCheckIcon}
                  label={`${m.admin_email_consents()}: ${person.name}`}
                  onClick={() => setConsentPerson(person)}
                />
                <RowActionButton
                  icon={PencilIcon}
                  label={m.admin_edit_item({ name: person.name })}
                  onClick={() => {
                    setEditingPerson(person);
                    setShowForm(true);
                  }}
                />
                <PersonDuplicates person={person} onMerge={openMerge} />
              </RowActions>
            );
          },
        }),
      ]),
    [
      setEditingPerson,
      setShowForm,
      setDeletingPerson,
      setDeleteError,
      setViewRegistrationsPerson,
      setConsentPerson,
      openMerge,
    ],
  );

  return {
    handleMergeConfirm,
    openMerge,
    handleDeleteConfirm,
    handleSavePerson,
    closePersonRegistrations,
    personRegistrationsQuery,
    personRegistrations,
    loadingPersonRegistrations,
    personRegistrationsError,
    personPaymentSummaryQuery,
    personPaymentSummary,
    ledgerActiveSort,
    ledgerBackendSort,
    ledgerBackendSortDir,
    personLedgerQuery,
    handleExportLedger,
    personPaymentTotals,
    columns,
    mergeState,
    setMergeState,
    merging,
    setMerging,
    mergeError,
    setMergeError,
    mergeSuccess,
    setMergeSuccess,
    createSuccess,
    setCreateSuccess,
    updateSuccess,
    setUpdateSuccess,
    deleteSuccess,
    setDeleteSuccess,
    showForm,
    setShowForm,
    editingPerson,
    setEditingPerson,
    deletingPerson,
    setDeletingPerson,
    deleting,
    setDeleting,
    deleteError,
    setDeleteError,
    viewRegistrationsPerson,
    setViewRegistrationsPerson,
    emailDraft,
    setEmailDraft,
    consentPerson,
    setConsentPerson,
    exportingLedger,
    setExportingLedger,
    ledgerExportError,
    setLedgerExportError,
    showLedgerModal,
    setShowLedgerModal,
    ledgerPage,
    setLedgerPage,
    ledgerSorting,
    setLedgerSorting,
  };
}

export type PeopleManagementState = ReturnType<typeof usePeopleManagement>;

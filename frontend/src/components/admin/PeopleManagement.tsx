import { PersonDuplicates } from "./PersonDuplicates";
import { PeopleDataTable, PersonName } from "./PeopleDataTable";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRightIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  EyeIcon,
  FileSpreadsheetIcon,
  MailIcon,
  NotebookTextIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
  UserRoundCogIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { useState, useCallback, useMemo } from "react";
import { type SortingState } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";
import { queryKeys } from "@/utils/queryKeys";
import {
  fetchAdminPersonRegistrations,
  fetchPersonPaymentSummary,
} from "@/utils/adminRegistrationApi";
import {
  downloadPaymentTransactionsCsv,
  fetchPaymentTransactionsLedger,
  LEDGER_PAGE_SIZE,
} from "@/utils/adminFetch";
import { devError } from "@/utils/devLog";
import { createAppColumnHelper } from "@/hooks/useAdminTable";
import PersonFormModal, { type PersonFormData } from "./PersonFormModal";
import LedgerModal, { LEDGER_SORT_KEY_BY_COLUMN } from "./LedgerModal";
import { buildMemberEmailDraft, type EmailDraft } from "@/utils/emailComposer";
import EmailComposeModal from "./EmailComposeModal";

const columnHelper = createAppColumnHelper<Person>();

interface PeopleManagementProps {
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
  authHeaders,
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [viewRegistrationsPerson, setViewRegistrationsPerson] = useState<Person | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
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
      setMergeError(err instanceof Error ? err.message : m.admin_people_merge_error());
    } finally {
      setMerging(false);
    }
  };

  const openMerge = useCallback((a: Person, b: Person) => {
    // Default: keep the one with more registrations as canonical
    const aCount = a.registrationCount ?? 0;
    const bCount = b.registrationCount ?? 0;
    setMergeState({ canonical: aCount >= bCount ? a : b, duplicate: aCount >= bCount ? b : a });
    setMergeError("");
    setMergeSuccess(false);
  }, []);

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
              {row.original.roles.map((role) => (
                <Badge key={role} variant="secondary" className="capitalize">
                  {role}
                </Badge>
              ))}
            </div>
          ),
          meta: { tdClassName: "hidden lg:table-cell" },
        }),
        columnHelper.accessor((row) => row.registrationCount ?? 0, {
          id: "registrations",
          header: m.admin_registrations_tab(),
          cell: ({ row, getValue }) => {
            const person = row.original;
            const resCount = getValue();
            return (
              <>
                <Badge variant={resCount > 0 ? "warning" : "secondary"}>{resCount}</Badge>
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
              <div className="flex flex-wrap gap-1">
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
                  variant="outline"
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
                <PersonDuplicates person={person} authHeaders={authHeaders} onMerge={openMerge} />
              </div>
            );
          },
        }),
      ]),
    [
      authHeaders,
      setEditingPerson,
      setShowForm,
      setDeletingId,
      setDeleteError,
      setViewRegistrationsPerson,
      openMerge,
    ],
  );

  return (
    <>
      <EmailComposeModal draft={emailDraft} onClose={() => setEmailDraft(null)} />
      <Card tone="secondary">
        <CardHeader>{m.admin_people_tab()}</CardHeader>

        <CardContent className="p-0">
          {mergeSuccess && (
            <Alert
              role="status"
              aria-live="polite"
              variant="success"
              className="m-4 mb-0"
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
              className="m-4 mb-0"
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
              className="m-4 mb-0"
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
              className="m-4 mb-0"
              onClose={() => setDeleteSuccess(false)}
            >
              {m.admin_people_delete_success()}
            </Alert>
          )}

          <PeopleDataTable
            id="people"
            authHeaders={authHeaders}
            columns={columns}
            onOpen={(person) => {
              setEditingPerson(person);
              setShowForm(true);
            }}
            primaryAction={
              <Button
                variant="outline-primary"
                onClick={() => {
                  setEditingPerson(null);
                  setShowForm(true);
                }}
              >
                {m.admin_people_add_person()}
              </Button>
            }
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
                <Icon icon={UserRoundCogIcon} className="me-2" />
                {m.admin_people_merge_title()}
              </DialogTitle>
            </DialogHeader>

            <DialogBody>
              {mergeError && (
                <Alert role="alert" aria-live="assertive" variant="danger">
                  {mergeError}
                </Alert>
              )}

              <p className="text-subtle text-sm mb-4">{m.admin_people_duplicates_same_email()}</p>

              {(["canonical", "duplicate"] as const).map((role) => {
                const person = mergeState[role];
                const resCount = person.registrationCount ?? 0;
                const label =
                  role === "canonical"
                    ? m.admin_people_merge_into()
                    : m.admin_people_merge_discard();
                const variant = role === "canonical" ? "success" : "danger";
                const tone =
                  role === "canonical"
                    ? "border-success text-success"
                    : "border-destructive text-destructive";

                return (
                  <Card key={role} tone={variant} className="mb-4">
                    <CardHeader className={`${tone} text-sm font-semibold flex justify-between`}>
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
                    <CardContent className="py-2 text-sm">
                      <div className="font-semibold">{person.name}</div>
                      <div className="text-subtle">{person.email}</div>
                      {person.phone && <div className="text-subtle">{person.phone}</div>}
                      <div className="mt-1">
                        <Badge variant={resCount > 0 ? "warning" : "secondary"}>
                          {resCount} {m.admin_people_registrations_count()}
                        </Badge>
                        {person.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="ms-1 capitalize">
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
              <Button variant="outline" onClick={() => setMergeState(null)}>
                {m.close()}
              </Button>
              <Button variant="warning" onClick={handleMergeConfirm} disabled={merging}>
                {merging ? (
                  <Spinner size="sm" role="status" aria-hidden="true" />
                ) : (
                  <>
                    <Icon icon={UserRoundCogIcon} className="me-1" />
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
              <DialogTitle className="text-destructive">
                <Icon icon={TrashIcon} className="me-2" />
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
              <Button variant="outline" size="sm" onClick={() => setDeletingId(null)}>
                {m.admin_action_cancel()}
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? <Spinner size="sm" /> : <Icon icon={TrashIcon} />}
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
                <Icon icon={CalendarCheckIcon} className="me-2" />
                {m.admin_people_registrations_modal_title()} — {viewRegistrationsPerson.name}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="p-0">
              {loadingPersonRegistrations && (
                <div className="text-center py-6">
                  <Spinner label={m.admin_loading()} size="sm" variant="warning" />
                </div>
              )}
              {!loadingPersonRegistrations && personRegistrationsError && (
                <Alert role="alert" aria-live="assertive" variant="danger" className="m-4">
                  {m.admin_people_registrations_load_error()}
                </Alert>
              )}
              {!loadingPersonRegistrations &&
                !personRegistrationsError &&
                personRegistrations.length === 0 && (
                  <p className="text-subtle text-center py-6 mb-0">
                    {m.admin_people_registrations_empty()}
                  </p>
                )}
              {!loadingPersonRegistrations &&
                !personRegistrationsError &&
                personRegistrations.length > 0 && (
                  <div className="px-4 pt-4 text-sm text-subtle">
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
                        <div key={edition.label} className="ms-2">
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
                      <PresentationListItem key={r.id} className="py-2">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="font-semibold text-sm">{r.eventTitle}</div>
                            <div className="text-subtle text-sm">
                              <Icon icon={UsersIcon} className="me-1" />
                              {r.guestCount}
                              <span className="ms-2">€{r.amountPaid.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-wrap justify-end">
                            <Badge
                              variant={
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
                              variant={
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
                              <Badge variant="success">
                                <Icon icon={CircleCheckIcon} className="me-1" />
                                {m.admin_checked_in()}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-subtle text-tiny">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </div>
                      </PresentationListItem>
                    ))}
                  </PresentationList>
                )}
            </DialogBody>
            <DialogFooter className="flex-col items-stretch">
              {ledgerExportError && (
                <Alert role="alert" aria-live="assertive" variant="danger" className="py-2 mb-2">
                  {ledgerExportError}
                </Alert>
              )}
              <div className="flex justify-between gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={personRegistrations.length === 0}
                    onClick={() => {
                      setLedgerPage(1);
                      setLedgerSorting([]);
                      setShowLedgerModal(true);
                    }}
                    title={m.admin_payment_view_ledger()}
                  >
                    <Icon icon={NotebookTextIcon} />
                    {m.admin_payment_view_ledger()}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportingLedger || personRegistrations.length === 0}
                    onClick={() => void handleExportLedger()}
                    title={m.admin_people_export_ledger()}
                  >
                    {exportingLedger ? <Spinner size="sm" /> : <Icon icon={FileSpreadsheetIcon} />}
                    {m.admin_people_export_ledger()}
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={closePersonRegistrations}>
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

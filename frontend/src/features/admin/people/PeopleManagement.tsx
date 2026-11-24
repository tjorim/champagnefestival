import { PeopleDataTable } from "./PeopleDataTable";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { m } from "@/paraglide/messages";
import { LEDGER_PAGE_SIZE } from "@/lib/api/adminFetch";
import PersonEmailConsents from "./PersonEmailConsents";
import PersonFormModal from "./PersonFormModal";
import LedgerModal from "../shared/LedgerModal";
import EmailComposeModal from "../shared/EmailComposeModal";
import { AdminAddButton } from "@/components/admin/RowActions";
import { type PeopleManagementProps, usePeopleManagement } from "./management/usePeopleManagement";
import { MergeDialog } from "./management/MergeDialog";
import { DeletePersonDialog } from "./management/DeletePersonDialog";
import { PersonRegistrationsDialog } from "./management/PersonRegistrationsDialog";

export default function PeopleManagement(props: PeopleManagementProps) {
  const state = usePeopleManagement(props);
  const {
    handleSavePerson,
    personLedgerQuery,
    columns,
    mergeState,
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
    viewRegistrationsPerson,
    emailDraft,
    setEmailDraft,
    consentPerson,
    setConsentPerson,
    showLedgerModal,
    setShowLedgerModal,
    ledgerPage,
    setLedgerPage,
    ledgerSorting,
    setLedgerSorting,
  } = state;
  return (
    <>
      <EmailComposeModal draft={emailDraft} onClose={() => setEmailDraft(null)} />
      {consentPerson && (
        <PersonEmailConsents
          person={consentPerson}

          onClose={() => setConsentPerson(null)}
        />
      )}
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

            columns={columns}
            onOpen={(person) => {
              setEditingPerson(person);
              setShowForm(true);
            }}
            primaryAction={
              <AdminAddButton
                size="default"
                onClick={() => {
                  setEditingPerson(null);
                  setShowForm(true);
                }}
              >
                {m.admin_people_add_person()}
              </AdminAddButton>
            }
          />
        </CardContent>
      </Card>

      {mergeState && <MergeDialog state={state} />}

      {/* Delete confirm modal */}
      {deletingPerson && <DeletePersonDialog state={state} />}

      {/* Create / edit person modal */}
      <PersonFormModal
        onReuse={(person) => {
          setEditingPerson(person);
        }}
        show={showForm}
        person={editingPerson}
        onSave={handleSavePerson}
        onHide={() => {
          setShowForm(false);
          setEditingPerson(null);
        }}
      />

      {/* Person registrations modal */}
      {viewRegistrationsPerson && <PersonRegistrationsDialog state={state} />}

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

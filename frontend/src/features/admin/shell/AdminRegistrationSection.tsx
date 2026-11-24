import { useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import StaffTasks from "@/components/StaffTasks";
import { formatDateRange } from "@/lib/format/dateUtils";
import { editionDisplayNameWithType } from "@/lib/editions/editionName";
import { useLocationChoice } from "@/hooks/useLocationChoice";
import { fetchRegistration } from "@/lib/api/adminFetch";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import { devError } from "@/lib/devLog";
import type { RegistrationStatus } from "@/types/registration";
import RegistrationList from "../registrations/RegistrationList";
import RegistrationDetail from "../registrations/RegistrationDetail";
import { usePersonDuplicates } from "../people/PersonDuplicates";
import { readAuditRegistrationTarget } from "../shared/auditRecordLink";
import { useAdminWorkspace } from "./AdminWorkspace";
import { useAdminPeopleActions } from "./useAdminPeopleActions";
import { useWorkspaceRegistrationActions } from "../registrations/useWorkspaceRegistrationActions";

export function HomeSection() {
  const {
    activeEdition,
    queries: { registrationCountsQuery },
  } = useAdminWorkspace();
  return (
    <StaffTasks
      expanded
      pendingBookings={{
        count: registrationCountsQuery.data?.pending,
        loading: registrationCountsQuery.isPending,
        error: registrationCountsQuery.isError,
        retry: () => void registrationCountsQuery.refetch(),
      }}
      editionId={activeEdition.id || undefined}
      editionLabel={
        activeEdition.id
          ? `${editionDisplayNameWithType(activeEdition)} · ${formatDateRange(activeEdition.dates, getLocale())}`
          : undefined
      }
    />
  );
}

export function RegistrationsSection() {
  const {
    queries,
    activeEdition,
    activeEditionLoaded,
    canManageAdminSections,
    applyActiveEditionFilterRequest,
    detailRegistration,
    setDetailRegistration,
    registrationError,
    setRegistrationError,
  } = useAdminWorkspace();
  const {
    registrationsQuery,
    tablesQuery,
    layoutsQuery,
    organizationsQuery,
    registrationsCollection,
    organizationsCollection,
    registrationsQueryKey,
  } = queries;
  const registrations = registrationsQuery.data ?? [];
  const tables = tablesQuery.data ?? [];
  const layouts = layoutsQuery.data ?? [];
  const organizations = organizationsQuery.data ?? [];
  const queryClient = useQueryClient();
  const locationSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const [filterValue, setFilter] = useLocationChoice(
    "registrationStatus",
    ["all", "pending", "confirmed", "cancelled"],
    "all",
  );
  const filter = filterValue as "all" | RegistrationStatus;
  useEffect(() => {
    if (!canManageAdminSections) return;
    const id = readAuditRegistrationTarget();
    if (!id) return;
    let current = true;
    void fetchRegistration(id).then(
      (registration) => {
        if (current) setDetailRegistration(registration);
      },
      (error: unknown) => {
        if (current) setRegistrationError(apiErrorMessage(error, m.admin_error_load_data()));
      },
    );
    return () => {
      current = false;
    };
  }, [canManageAdminSections, setDetailRegistration, setRegistrationError]);

  const duplicatesQuery = usePersonDuplicates(
    detailRegistration?.person ?? null,

    canManageAdminSections,
  );
  const emailDuplicates = duplicatesQuery.data?.items ?? [];
  const { handleMergePeople } = useAdminPeopleActions({
    detailRegistration,

    organizationsCollection,
    registrationsCollection,
    queryClient,
    registrationsQueryKey,
    setDetailRegistration,
  });
  const {
    handleAddRegistration,
    handleAddTransaction,
    handleAssignTable,
    handleSaveBooking,
    handleCheckIn,
    handleIssueStrap,
    handleToggleDelivered,
    handleRecordPayment,
    handleUpdateStatus,
    handleViewDetail,
    confirmDialog,
  } = useWorkspaceRegistrationActions();
  return (
    <>
      <RegistrationList
        registrations={registrations}
        tables={tables}
        organizations={organizations}
        filter={filter}
        onFilterChange={setFilter}
        onUpdateStatus={handleUpdateStatus}
        onRecordPayment={handleRecordPayment}
        onAssignTable={handleAssignTable}
        onViewDetail={handleViewDetail}
        onCheckIn={handleCheckIn}
        onIssueStrap={handleIssueStrap}
        onAddRegistration={handleAddRegistration}

        activeEdition={activeEdition}
        activeEditionLoaded={activeEditionLoaded}
        canManageAdminSections={canManageAdminSections}
        countedPendingQueue={locationSearch.workQueue === "pending"}
        applyActiveEditionFilterRequest={applyActiveEditionFilterRequest}
        sectionError={registrationError}
        onClearSectionError={() => setRegistrationError("")}
      />
      {detailRegistration && (
        <RegistrationDetail
          registration={detailRegistration}
          registrations={registrations}

          baseUrl={window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "")}
          emailDuplicates={emailDuplicates}
          tables={tables.filter((t) =>
            layouts.some((l) => l.id === t.layout_id && l.event_id === detailRegistration.event_id),
          )}
          onSaveBooking={handleSaveBooking}
          onAddTransaction={handleAddTransaction}
          onClose={() => {
            setDetailRegistration(null);
            setRegistrationError("");
          }}
          onToggleDelivered={handleToggleDelivered}
          onCheckIn={handleCheckIn}
          onIssueStrap={handleIssueStrap}
          actionError={registrationError}
          onClearActionError={() => setRegistrationError("")}
          onMergeDuplicate={async (canonicalId, duplicateId) => {
            try {
              await handleMergePeople(canonicalId, duplicateId);
              setDetailRegistration(null);
            } catch (err) {
              devError("Failed to merge people", err);
              setRegistrationError(apiErrorMessage(err, m.admin_people_merge_error()));
            }
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

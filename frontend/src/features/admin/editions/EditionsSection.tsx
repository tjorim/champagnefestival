import { activeEditionQueryKey } from "@/hooks/useActiveEdition";
import { invalidateAdmin } from "@/lib/query/queryInvalidation";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminAddButton } from "@/components/admin/RowActions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { queryKeys } from "@/lib/query/queryKeys";
import { fetchEditions } from "@/lib/api/editionsApi";
import type { Edition, Organization, Venue } from "@/api-types";
import EditionCard from "./EditionCard";
import EditionModal from "./EditionModal";
import type { EditionType } from "./editionTypes";

const editionsQueryKey = queryKeys.admin.editions;

function editionTypeLabel(type: EditionType | "all") {
  switch (type) {
    case "festival":
      return m.admin_filter_edition_festivals();
    case "bourse":
      return m.admin_edition_type_bourse();
    case "capsule_exchange":
      return m.admin_edition_type_capsule_exchange();
    default:
      return m.admin_filter_edition_all();
  }
}

interface EditionsSectionProps {
  venues: Venue[];
  /** The organisations collection's rows, offered as the lineup, co-organiser and sponsor choices. */
  organizations: Organization[];
  organizationsPending?: boolean;
}

export function EditionsSection({
  venues,
  organizations,
  organizationsPending,
}: EditionsSectionProps) {
  const queryClient = useQueryClient();
  const invalidateEditionViews = useCallback(
    () =>
      invalidateAdmin(queryClient, [
        activeEditionQueryKey,
        queryKeys.admin.activeEdition,
        queryKeys.admin.activeEditionEvents,
        queryKeys.admin.editionStats,
        queryKeys.admin.registrations,
        queryKeys.admin.layouts,
        queryKeys.admin.tables,
        queryKeys.admin.areas,
      ]),
    [queryClient],
  );
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editionTypeFilter, setEditionTypeFilter] = useState<EditionType | "all">("all");

  const editionsQuery = useQuery({
    queryKey: editionsQueryKey,
    queryFn: () => fetchEditions(),
    staleTime: 60 * 1000,
    retry: false,
  });

  const visibleEditions = useMemo(
    () =>
      (editionsQuery.data ?? []).filter(
        (edition) => editionTypeFilter === "all" || edition.edition_type === editionTypeFilter,
      ),
    [editionTypeFilter, editionsQuery.data],
  );
  const groupedEditions = useMemo(
    () => ({
      festival: visibleEditions.filter((edition) => edition.edition_type === "festival"),
      bourse: visibleEditions.filter((edition) => edition.edition_type === "bourse"),
      capsule_exchange: visibleEditions.filter(
        (edition) => edition.edition_type === "capsule_exchange",
      ),
    }),
    [visibleEditions],
  );

  const handleCreated = useCallback(
    (edition: Edition) => {
      queryClient.setQueryData<Edition[]>(editionsQueryKey, (prev = []) => [...prev, edition]);
      setAddModalOpen(false);
      void invalidateEditionViews();
    },
    [invalidateEditionViews, queryClient],
  );

  const handleDeleted = useCallback(
    (id: string) => {
      queryClient.setQueryData<Edition[]>(editionsQueryKey, (prev = []) =>
        prev.filter((edition) => edition.id !== id),
      );
      void invalidateEditionViews();
    },
    [invalidateEditionViews, queryClient],
  );

  const handleUpdated = useCallback(
    (updated: Edition) => {
      queryClient.setQueryData<Edition[]>(editionsQueryKey, (prev = []) =>
        prev.map((edition) => (edition.id === updated.id ? updated : edition)),
      );
      void invalidateEditionViews();
    },
    [invalidateEditionViews, queryClient],
  );

  const handleEventMutation = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: editionsQueryKey });
    void invalidateEditionViews();
  }, [invalidateEditionViews, queryClient]);

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
        <div>
          <h2 className="mb-1 text-base font-semibold leading-tight text-primary">
            {m.admin_content_editions_section()}
          </h2>
          <ToggleGroup
            size="sm"
            variant="outline"
            value={[editionTypeFilter]}
            onValueChange={(values) => {
              const value = values[0];
              if (value) setEditionTypeFilter(value as typeof editionTypeFilter);
            }}
            aria-label={m.admin_content_edition_type_filter_aria()}
          >
            {(["all", "festival", "bourse", "capsule_exchange"] as const).map((type) => (
              <ToggleGroupItem key={type} value={type}>
                {editionTypeLabel(type)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <AdminAddButton onClick={() => setAddModalOpen(true)}>
          {m.admin_content_edition_add()}
        </AdminAddButton>
      </div>

      {editionsQuery.isPending && (
        <div className="text-center py-4">
          <Spinner size="sm" variant="primary" />
          <span className="ms-2 text-subtle">{m.admin_content_loading()}</span>
        </div>
      )}
      {!editionsQuery.isPending && editionsQuery.isError && (
        <Alert role="alert" aria-live="assertive" variant="danger" className="py-2 text-sm">
          {m.admin_content_error_load()}
        </Alert>
      )}
      {!editionsQuery.isPending &&
        !editionsQuery.isError &&
        (editionsQuery.data ?? []).length === 0 && (
          <AdminEmptyState>{m.admin_content_no_editions()}</AdminEmptyState>
        )}
      {!editionsQuery.isPending && !editionsQuery.isError && (
        <div className="flex flex-col gap-4">
          {(["festival", "bourse", "capsule_exchange"] as const).map((type) => {
            const grouped = groupedEditions[type];
            if (grouped.length === 0) return null;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="mb-0 text-base font-semibold leading-tight text-content">
                    {editionTypeLabel(type)}
                  </h3>
                  <Badge variant="secondary">{grouped.length}</Badge>
                </div>
                {grouped.map((edition) => (
                  <EditionCard
                    key={edition.id}
                    edition={edition}
                    venues={venues}
                    organizations={organizations}
                    organizationsPending={organizationsPending}

                    onDeleted={handleDeleted}
                    onUpdated={handleUpdated}
                    onEventMutation={handleEventMutation}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      <EditionModal
        show={addModalOpen}
        initial={null}
        venues={venues}
        organizations={organizations}
        organizationsPending={organizationsPending}

        onSaved={handleCreated}
        onHide={() => setAddModalOpen(false)}
      />
    </div>
  );
}

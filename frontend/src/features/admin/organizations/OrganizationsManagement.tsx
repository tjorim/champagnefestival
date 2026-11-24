import {
  auditRecordId,
  focusAuditRecord,
  isAuditRecordTarget,
} from "@/features/admin/shared/auditRecordLink";
import type { Organization, OrganizationCreate } from "@/api-types";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AdminInput } from "@/components/admin/AdminFields";
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  RotateCcwIcon,
  TrashIcon,
  UserIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import { fetchEditions } from "@/lib/api/editionsApi";
import { queryKeys } from "@/lib/query/queryKeys";
import {
  refetchAdminOrganizations,
  type AdminOrganizationsCollection,
} from "@/lib/collections/adminOrganizationsCollection";
import { editionDisplayName } from "@/lib/editions/editionName";
import { AdminAddButton, RowActionButton, RowActions } from "@/components/admin/RowActions";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import OrganizationModal from "./OrganizationModal";
import { useOrganizationActions } from "./useOrganizationActions";

function typeBadgeVariant(type: string | undefined): BadgeVariant {
  switch (type) {
    case "producer":
      return "warning";
    case "sponsor":
      return "info";
    default:
      return "secondary";
  }
}

function typeLabel(type: string | undefined): string {
  switch (type) {
    case "producer":
      return m.admin_item_producer();
    case "sponsor":
      return m.admin_item_sponsor();
    default:
      return m.admin_item_vendor();
  }
}

interface OrganizationsManagementProps {
  /** The organisations collection's rows: the one client cache of organisations. */
  organizations: Organization[];
  collection: AdminOrganizationsCollection;
  isPending: boolean;
  loadError: boolean;
}

/** The dashboard's organisations list: create, edit, archive, restore and delete. */
export default function OrganizationsManagement({
  organizations,
  collection,
  isPending,
  loadError,
}: OrganizationsManagementProps) {
  const queryClient = useQueryClient();
  const { save, setActive, archiveMany, remove, saving } = useOrganizationActions(collection);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [modalItem, setModalItem] = useState<Organization | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState<boolean | undefined>();
  const [typeFilter, setTypeFilter] = useState<"all" | "producer" | "sponsor" | "vendor">("all");
  const [q, setQ] = useState("");
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchiveInProgress, setBulkArchiveInProgress] = useState(false);

  const editionsQuery = useQuery({
    queryKey: queryKeys.admin.editions,
    queryFn: () => fetchEditions(),
    staleTime: 60 * 1000,
    retry: false,
  });

  // Map organisation id → array of edition labels that reference it (as producer, sponsor, or vendor)
  const editionsByItemId = useMemo((): Map<number, string[]> => {
    const editions = editionsQuery.data ?? [];
    const map = new Map<number, string[]>();
    for (const edition of editions) {
      const label = editionDisplayName(edition);
      for (const item of [
        ...(edition.producers ?? []),
        ...(edition.sponsors ?? []),
        ...(edition.vendors ?? []),
      ]) {
        const existing = map.get(item.id);
        if (existing) map.set(item.id, [...existing, label]);
        else map.set(item.id, [label]);
      }
    }
    return map;
  }, [editionsQuery.data]);

  const items = organizations;
  const showArchived =
    archivedOpen ??
    items.some((item) => !item.active && isAuditRecordTarget("organization", item.id));

  const { activeItems, archivedItems, totalActive, totalArchived } = useMemo(() => {
    const s = q.toLowerCase();
    const matches = (item: Organization): boolean => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (s) {
        return (
          item.name.toLowerCase().includes(s) ||
          (item.contact_person?.name ?? "").toLowerCase().includes(s)
        );
      }
      return true;
    };
    const activeItems: Organization[] = [];
    const archivedItems: Organization[] = [];
    let totalActive = 0;
    let totalArchived = 0;
    for (const item of items) {
      if (item.active) {
        totalActive += 1;
        if (matches(item)) activeItems.push(item);
      } else {
        totalArchived += 1;
        if (matches(item)) archivedItems.push(item);
      }
    }
    return { activeItems, archivedItems, totalActive, totalArchived };
  }, [items, typeFilter, q]);

  const typeLabels: Record<"all" | "producer" | "sponsor" | "vendor", string> = {
    all: m.admin_filter_all(),
    producer: m.admin_item_producer(),
    sponsor: m.admin_item_sponsor(),
    vendor: m.admin_item_vendor(),
  };

  function openAdd() {
    setModalItem(null);
    setModalOpen(true);
  }

  function openEdit(item: Organization) {
    setModalItem(item);
    setModalOpen(true);
  }

  function handleClearFilters() {
    setTypeFilter("all");
    setQ("");
  }

  const handleModalSave = useCallback(
    async (body: OrganizationCreate, id: number | null) => {
      setActionError(null);
      try {
        const saved = await save(id, body);
        setImageErrors((prev) => {
          const copy = new Set(prev);
          copy.delete(saved.id);
          return copy;
        });
        setModalOpen(false);
      } catch (error) {
        setActionError(apiErrorMessage(error, m.admin_content_error_save()));
      }
    },
    [save],
  );

  // A logo upload changes the organisation on the server (and the images editions embed);
  // the uploader has already dropped a response that belongs to an earlier session.
  const handleLogoSaved = useCallback(() => {
    void refetchAdminOrganizations(collection);
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.editions });
  }, [collection, queryClient]);

  const handleSetActive = useCallback(
    async (id: number, active: boolean) => {
      setActionError(null);
      try {
        await setActive(id, active);
      } catch (error) {
        setActionError(apiErrorMessage(error, m.admin_content_error_save()));
      }
    },
    [setActive],
  );

  const handleDelete = useCallback(
    async (item: Organization) => {
      const confirmed = await confirm({
        title: m.admin_item_delete_title(),
        body: m.admin_item_delete_confirm({ name: item.name }),
        confirmLabel: m.admin_delete(),
        errorFallback: m.admin_item_delete_error(),
      });
      if (!confirmed) return;
      setActionError(null);
      try {
        await remove(item.id);
      } catch (error) {
        setActionError(apiErrorMessage(error, m.admin_content_error_save()));
      }
    },
    [confirm, remove],
  );

  const handleBulkArchive = useCallback(async () => {
    setBulkArchiveInProgress(true);
    const snapshot = [...activeItems];
    const failedCount = await archiveMany(snapshot.map((item) => item.id));
    if (failedCount > 0) {
      setActionError(
        m.admin_bulk_content_archive_error({
          failed: failedCount,
          total: snapshot.length,
        }),
      );
    }
    setBulkArchiveInProgress(false);
    setBulkArchiveOpen(false);
  }, [activeItems, archiveMany]);

  function renderItemRow(item: Organization, isArchived: boolean) {
    return (
      <PresentationListItem
        key={item.id}
        id={auditRecordId("organization", item.id)}
        tabIndex={-1}
        ref={focusAuditRecord}
        className={cn("flex justify-between items-center gap-2", isArchived && "opacity-50")}
      >
        <span className="flex items-center gap-2 grow truncate">
          {item.image && (
            <span className="inline-flex items-center justify-center w-8 h-8 shrink-0">
              {imageErrors.has(item.id) ? (
                <span role="img" aria-label={m.admin_image_unavailable({ name: item.name })}>
                  🖼
                </span>
              ) : (
                <img
                  src={item.image}
                  alt=""
                  loading="lazy"
                  className="w-8 h-8 object-contain"
                  onError={() => setImageErrors((prev) => new Set(prev).add(item.id))}
                />
              )}
            </span>
          )}
          {editionsByItemId.has(item.id) ? (
            <Tooltip>
              <TooltipTrigger
                aria-description={`${m.admin_content_used_in_editions()}: ${editionsByItemId.get(item.id)!.join(", ")}`}
                render={<button type="button" />}
                className={cn(
                  "truncate border-0 bg-transparent p-0 underline decoration-dotted",
                  isArchived ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {item.name}
              </TooltipTrigger>
              <TooltipContent admin>
                {m.admin_content_used_in_editions()}: {editionsByItemId.get(item.id)!.join(", ")}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className={cn("truncate", isArchived ? "text-subtle" : "text-content")}>
              {item.name}
            </span>
          )}
          <Badge
            variant={typeBadgeVariant(item.type)}
            className="shrink-0"
            aria-label={`${m.admin_item_type()}: ${typeLabel(item.type)}`}
          >
            {typeLabel(item.type)}
          </Badge>
          {item.contact_person && (
            <small className="text-subtle truncate hidden site-lg:inline">
              <Icon icon={UserIcon} className="me-1" />
              {item.contact_person.name}
            </small>
          )}
        </span>
        <RowActions
          className="shrink-0"
          destructive={
            isArchived ? (
              <RowActionButton
                destructive
                icon={TrashIcon}
                label={m.admin_delete_item({ name: item.name })}
                onClick={() => handleDelete(item)}
              />
            ) : undefined
          }
        >
          {!isArchived && (
            <RowActionButton
              icon={PencilIcon}
              label={m.admin_edit_item({ name: item.name })}
              onClick={() => openEdit(item)}
            />
          )}
          {!isArchived ? (
            <RowActionButton
              icon={ArchiveIcon}
              label={`${m.admin_content_archive()}: ${item.name}`}
              onClick={() => handleSetActive(item.id, false)}
            />
          ) : (
            <RowActionButton
              variant="outline-success"
              icon={RotateCcwIcon}
              label={`${m.admin_content_restore()}: ${item.name}`}
              onClick={() => handleSetActive(item.id, true)}
            />
          )}
        </RowActions>
      </PresentationListItem>
    );
  }

  if (isPending) {
    return (
      <div className="text-center py-4">
        <Spinner size="sm" variant="primary" />
        <span className="ms-2 text-subtle">{m.admin_content_loading()}</span>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
        <h2 className="mb-0 text-base font-semibold leading-tight text-primary">
          {m.admin_content_organizations_section()}
          <Badge variant="secondary" className="ms-2">
            {totalActive}
          </Badge>
          {totalArchived > 0 && (
            <Badge variant="outline" className="ms-1">
              {totalArchived} {m.admin_content_archived_section()}
            </Badge>
          )}
        </h2>
        <AdminAddButton onClick={openAdd}>{m.admin_content_add_item()}</AdminAddButton>
      </div>
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <ToggleGroup
          size="sm"
          variant="outline"
          value={[typeFilter]}
          onValueChange={(values) => {
            const value = values[0];
            if (value) setTypeFilter(value as typeof typeFilter);
          }}
          aria-label={m.admin_content_type_filter_aria()}
        >
          {(["all", "producer", "sponsor", "vendor"] as const).map((type) => (
            <ToggleGroupItem key={type} value={type}>
              {typeLabels[type]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <AdminInput
          size="sm"
          type="search"
          placeholder={m.admin_content_search_placeholder()}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="bg-muted text-content border-input max-w-65"
        />
        {typeFilter !== "all" && activeItems.length > 0 && (
          <Button
            size="sm"
            variant="outline-warning"
            onClick={() => setBulkArchiveOpen(true)}
            title={m.admin_bulk_content_archive_all({
              type: typeLabels[typeFilter],
            })}
          >
            <Icon icon={ArchiveIcon} />
            {m.admin_bulk_content_archive_all({ type: typeLabels[typeFilter] })}
          </Button>
        )}
      </div>

      {loadError && (
        <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-2">
          {m.admin_content_error_load()}
        </Alert>
      )}
      {confirmDialog}
      {actionError && (
        <Alert
          role="alert"
          aria-live="assertive"
          variant="danger"
          className="py-1 mb-2"
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      )}
      <PresentationList flush>
        {activeItems.map((item) => renderItemRow(item, false))}
      </PresentationList>
      {activeItems.length === 0 && archivedItems.length === 0 && (q || typeFilter !== "all") && (
        <AdminEmptyState
          action={
            <Button variant="outline" size="sm" onClick={handleClearFilters}>
              {m.admin_content_clear_filters()}
            </Button>
          }
        >
          {m.admin_content_no_results()}
        </AdminEmptyState>
      )}
      {archivedItems.length > 0 && (
        <div className="mt-2">
          <Button
            variant="link"
            size="sm"
            className="text-subtle px-0"
            onClick={() => setArchivedOpen(!showArchived)}
          >
            <Icon icon={showArchived ? ChevronDownIcon : ChevronRightIcon} />
            {m.admin_content_archived_section()}
          </Button>
          {showArchived && (
            <PresentationList flush>
              {archivedItems.map((item) => renderItemRow(item, true))}
            </PresentationList>
          )}
        </div>
      )}

      <OrganizationModal
        show={modalOpen}
        initial={modalItem}
        saving={saving}
        onSave={handleModalSave}
        onLogoSaved={handleLogoSaved}
        onHide={() => setModalOpen(false)}
      />

      {/* Bulk archive confirmation */}
      <Dialog
        open={bulkArchiveOpen}
        onOpenChange={(open) => {
          if (!open) setBulkArchiveOpen(false);
        }}
      >
        <DialogContent admin size="default">
          <DialogHeader>
            <DialogTitle>{m.admin_content_archive()}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {m.admin_bulk_content_archive_confirm({
              count: activeItems.length,
              type:
                typeFilter === "producer"
                  ? m.admin_item_producer()
                  : typeFilter === "sponsor"
                    ? m.admin_item_sponsor()
                    : m.admin_item_vendor(),
            })}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setBulkArchiveOpen(false)}
              disabled={bulkArchiveInProgress}
            >
              {m.admin_action_cancel()}
            </Button>
            <Button variant="warning" onClick={handleBulkArchive} disabled={bulkArchiveInProgress}>
              {bulkArchiveInProgress && <Spinner size="sm" aria-hidden="true" />}
              {m.admin_content_archive()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

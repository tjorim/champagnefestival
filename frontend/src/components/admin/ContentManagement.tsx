import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { AdminInput } from "@/components/admin/AdminFields";
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  TrashIcon,
  UserIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
/**
 * ContentManagement — admin tab for editing producers, sponsors, and editions.
 */

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import EditionCard from "./EditionCard";
import EditionModal from "./EditionModal";
import ItemModal from "./ItemModal";
import type { ItemDraft } from "./itemTypes";
import type { Edition, EditionType } from "./editionTypes";
import type { Venue } from "@/types/admin";
import { queryKeys } from "@/utils/queryKeys";
import {
  deleteContentSectionItem,
  fetchContentSectionItems,
  fetchEditions,
  saveContentSectionItem,
  updateContentSectionItemActive,
} from "@/utils/adminContentApi";

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

interface ContentManagementProps {
  authHeaders: () => Record<string, string>;
  venues: Venue[];
  onExhibitorSaved?: (item: ItemDraft, isCurrent: () => boolean) => void;
  onExhibitorDeleted?: (id: number, isCurrent: () => boolean) => void;
  /** Takes the exhibitors collection's session fence; called before each write request. */
  captureExhibitorsFence?: () => () => boolean;
  onEditionMutated?: () => void;
}

const contentSectionQueryKey = queryKeys.admin.contentManagement.section;
const contentEditionsQueryKey = queryKeys.admin.contentManagement.editions;

interface ContentSectionProps {
  sectionKey: string;
  title: string;
  authHeaders: () => Record<string, string>;
  /** `isCurrent` is the session fence taken before the request (always true without `captureFence`). */
  onItemSaved?: (item: ItemDraft, isCurrent: () => boolean) => void;
  onItemDeleted?: (id: number, isCurrent: () => boolean) => void;
  /** Takes a session fence before each write request, so a write that settles after sign-out can be dropped. */
  captureFence?: () => () => boolean;
}

const ALWAYS_CURRENT = () => true;

export function ContentSection({
  sectionKey,
  title,
  authHeaders,
  onItemSaved,
  onItemDeleted,
  captureFence,
}: ContentSectionProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [modalItem, setModalItem] = useState<ItemDraft | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "producer" | "sponsor" | "vendor">("all");
  const [q, setQ] = useState("");
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchiveInProgress, setBulkArchiveInProgress] = useState(false);

  const itemsQuery = useQuery({
    queryKey: contentSectionQueryKey(sectionKey),
    queryFn: () => fetchContentSectionItems(sectionKey, authHeaders),
    staleTime: 60 * 1000,
    retry: false,
  });

  const editionsQuery = useQuery({
    queryKey: contentEditionsQueryKey,
    queryFn: () => fetchEditions(authHeaders),
    staleTime: 60 * 1000,
    retry: false,
  });

  // Map item id → array of edition labels that reference it (as producer, sponsor, or vendor)
  const editionsByItemId = useMemo((): Map<number, string[]> => {
    const editions = editionsQuery.data ?? [];
    const map = new Map<number, string[]>();
    for (const edition of editions) {
      const label = `${edition.year} – ${edition.month}`;
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

  const saveItemMutation = useMutation({
    mutationFn: (draft: ItemDraft) => saveContentSectionItem(sectionKey, draft, authHeaders),
    retry: false,
  });

  const updateItemActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      updateContentSectionItemActive(sectionKey, id, active, authHeaders),
    retry: false,
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => deleteContentSectionItem(sectionKey, id, authHeaders),
    retry: false,
  });

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  const { activeItems, archivedItems, totalActive, totalArchived } = useMemo(() => {
    const s = q.toLowerCase();
    const matches = (item: ItemDraft): boolean => {
      const itemType = item.type ?? "vendor";
      if (typeFilter !== "all" && itemType !== typeFilter) return false;
      if (s) {
        return (
          item.name.toLowerCase().includes(s) ||
          (item.contactPerson?.name ?? "").toLowerCase().includes(s)
        );
      }
      return true;
    };
    const activeItems: ItemDraft[] = [];
    const archivedItems: ItemDraft[] = [];
    let totalActive = 0;
    let totalArchived = 0;
    for (const item of items) {
      const isActive = item.active !== false;
      if (isActive) {
        totalActive += 1;
        if (matches(item)) {
          activeItems.push(item);
        }
      } else {
        totalArchived += 1;
        if (matches(item)) {
          archivedItems.push(item);
        }
      }
    }
    return {
      activeItems,
      archivedItems,
      totalActive,
      totalArchived,
    };
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

  function openEdit(item: ItemDraft) {
    setModalItem(item);
    setModalOpen(true);
  }

  function handleClearFilters() {
    setTypeFilter("all");
    setQ("");
  }

  const handleModalSave = useCallback(
    async (draft: ItemDraft) => {
      setActionError(null);
      const isCurrent = captureFence?.() ?? ALWAYS_CURRENT;
      try {
        const saved = await saveItemMutation.mutateAsync(draft);
        queryClient.setQueryData<ItemDraft[]>(contentSectionQueryKey(sectionKey), (prev = []) => {
          const idx = prev.findIndex((item) => item.id === saved.id);
          return idx >= 0
            ? prev.map((item) => (item.id === saved.id ? saved : item))
            : [...prev, saved];
        });
        setImageErrors((prev) => {
          const copy = new Set(prev);
          copy.delete(saved.id);
          return copy;
        });
        onItemSaved?.(saved, isCurrent);
        setModalOpen(false);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : m.admin_content_error_save());
      }
    },
    [captureFence, onItemSaved, queryClient, saveItemMutation, sectionKey],
  );

  const handleArchive = useCallback(
    async (id: number) => {
      setActionError(null);
      const isCurrent = captureFence?.() ?? ALWAYS_CURRENT;
      try {
        const saved = await updateItemActiveMutation.mutateAsync({
          id,
          active: false,
        });
        queryClient.setQueryData<ItemDraft[]>(contentSectionQueryKey(sectionKey), (prev = []) =>
          prev.map((item) => (item.id === id ? saved : item)),
        );
        onItemSaved?.(saved, isCurrent);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : m.admin_content_error_save());
      }
    },
    [captureFence, onItemSaved, queryClient, sectionKey, updateItemActiveMutation],
  );

  const handleRestore = useCallback(
    async (id: number) => {
      setActionError(null);
      const isCurrent = captureFence?.() ?? ALWAYS_CURRENT;
      try {
        const saved = await updateItemActiveMutation.mutateAsync({
          id,
          active: true,
        });
        queryClient.setQueryData<ItemDraft[]>(contentSectionQueryKey(sectionKey), (prev = []) =>
          prev.map((item) => (item.id === id ? saved : item)),
        );
        onItemSaved?.(saved, isCurrent);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : m.admin_content_error_save());
      }
    },
    [captureFence, onItemSaved, queryClient, sectionKey, updateItemActiveMutation],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      setActionError(null);
      const isCurrent = captureFence?.() ?? ALWAYS_CURRENT;
      try {
        await deleteItemMutation.mutateAsync(id);
        queryClient.setQueryData<ItemDraft[]>(contentSectionQueryKey(sectionKey), (prev = []) =>
          prev.filter((item) => item.id !== id),
        );
        onItemDeleted?.(id, isCurrent);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : m.admin_content_error_save());
      }
    },
    [captureFence, deleteItemMutation, onItemDeleted, queryClient, sectionKey],
  );

  const handleBulkArchive = useCallback(async () => {
    setBulkArchiveInProgress(true);
    const isCurrent = captureFence?.() ?? ALWAYS_CURRENT;
    const snapshot = [...activeItems];
    const results = await Promise.allSettled(
      snapshot.map((item) => updateItemActiveMutation.mutateAsync({ id: item.id, active: false })),
    );
    const succeededIds = new Set(
      snapshot.filter((_, i) => results[i]?.status === "fulfilled").map((item) => item.id),
    );
    if (succeededIds.size > 0) {
      queryClient.setQueryData<ItemDraft[]>(contentSectionQueryKey(sectionKey), (prev = []) =>
        prev.map((item) => (succeededIds.has(item.id) ? { ...item, active: false } : item)),
      );
      snapshot
        .filter((item) => succeededIds.has(item.id))
        .forEach((item) => onItemSaved?.({ ...item, active: false }, isCurrent));
    }
    const failedCount = results.filter((r) => r.status === "rejected").length;
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
  }, [activeItems, captureFence, onItemSaved, queryClient, sectionKey, updateItemActiveMutation]);

  function renderItemRow(item: ItemDraft, isArchived: boolean) {
    return (
      <PresentationListItem
        key={item.id}
        className={clsx("flex justify-between items-center gap-2", isArchived && "opacity-50")}
      >
        <span className="flex items-center gap-2 grow truncate">
          {item.image && (
            <span className="inline-flex items-center justify-center w-8 h-8 shrink-0">
              {imageErrors.has(item.id) ? (
                <span role="img" aria-label={`Image unavailable for ${item.name}`}>
                  🖼
                </span>
              ) : (
                <img
                  src={item.image}
                  alt={item.name}
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
                className={clsx(
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
            <span className={clsx("truncate", isArchived ? "text-subtle" : "text-content")}>
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
          <small className="text-subtle truncate hidden site-md:inline">{item.image}</small>
          {item.contactPerson && (
            <small className="text-subtle truncate hidden site-lg:inline">
              <Icon icon={UserIcon} className="me-1" />
              {item.contactPerson.name}
            </small>
          )}
        </span>
        <span className="flex gap-1 shrink-0">
          {!isArchived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openEdit(item)}
              aria-label={`Edit ${item.name}`}
            >
              <Icon icon={PencilIcon} />
            </Button>
          )}
          {!isArchived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleArchive(item.id)}
              aria-label={`${m.admin_content_archive()} ${item.name}`}
              title={m.admin_content_archive()}
            >
              <Icon icon={ArchiveIcon} />
            </Button>
          ) : (
            <>
              <Button
                variant="outline-success"
                size="sm"
                onClick={() => handleRestore(item.id)}
                aria-label={`${m.admin_content_restore()} ${item.name}`}
                title={m.admin_content_restore()}
              >
                <Icon icon={RotateCcwIcon} />
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                aria-label={`${m.admin_delete()} ${item.name}`}
              >
                <Icon icon={TrashIcon} />
              </Button>
            </>
          )}
        </span>
      </PresentationListItem>
    );
  }

  if (itemsQuery.isPending) {
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
        <h6 className="mb-0 text-primary">
          {title}
          <Badge variant="secondary" className="ms-2">
            {totalActive}
          </Badge>
          {totalArchived > 0 && (
            <Badge variant="outline" className="ms-1">
              {totalArchived} {m.admin_content_archived_section()}
            </Badge>
          )}
        </h6>
        <Button variant="outline-primary" size="sm" onClick={openAdd}>
          <Icon icon={PlusIcon} />
          {m.admin_content_add_item()}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <ButtonGroup aria-label={m.admin_content_type_filter_aria()}>
          {(["all", "producer", "sponsor", "vendor"] as const).map((type) => (
            <Button
              size="sm"
              key={type}
              variant={typeFilter === type ? "default" : "outline"}
              aria-pressed={typeFilter === type}
              onClick={() => setTypeFilter(type)}
            >
              {typeLabels[type]}
            </Button>
          ))}
        </ButtonGroup>
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

      {itemsQuery.isError && (
        <Alert role="alert" aria-live="assertive" variant="danger" className="py-1 mb-2">
          {m.admin_content_error_load()}
        </Alert>
      )}
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
        <div className="text-center py-6 text-subtle">
          <p className="mb-2 text-sm">{m.admin_content_no_results()}</p>
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            {m.admin_content_clear_filters()}
          </Button>
        </div>
      )}
      {archivedItems.length > 0 && (
        <div className="mt-2">
          <Button
            variant="link"
            size="sm"
            className="text-subtle px-0"
            onClick={() => setArchivedOpen((value) => !value)}
          >
            <Icon icon={archivedOpen ? ChevronDownIcon : ChevronRightIcon} />
            {m.admin_content_archived_section()}
          </Button>
          {archivedOpen && (
            <PresentationList flush>
              {archivedItems.map((item) => renderItemRow(item, true))}
            </PresentationList>
          )}
        </div>
      )}

      <ItemModal
        show={modalOpen}
        initial={modalItem}
        authHeaders={authHeaders}
        onSave={handleModalSave}
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

interface EditionsSectionProps {
  authHeaders: () => Record<string, string>;
  venues: Venue[];
  onEditionMutated?: () => void;
}

export function EditionsSection({ authHeaders, venues, onEditionMutated }: EditionsSectionProps) {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editionTypeFilter, setEditionTypeFilter] = useState<EditionType | "all">("all");

  const editionsQuery = useQuery({
    queryKey: contentEditionsQueryKey,
    queryFn: () => fetchEditions(authHeaders),
    staleTime: 60 * 1000,
    retry: false,
  });

  const visibleEditions = useMemo(
    () =>
      (editionsQuery.data ?? []).filter(
        (edition) => editionTypeFilter === "all" || edition.editionType === editionTypeFilter,
      ),
    [editionTypeFilter, editionsQuery.data],
  );
  const groupedEditions = useMemo(
    () => ({
      festival: visibleEditions.filter((edition) => edition.editionType === "festival"),
      bourse: visibleEditions.filter((edition) => edition.editionType === "bourse"),
      capsule_exchange: visibleEditions.filter(
        (edition) => edition.editionType === "capsule_exchange",
      ),
    }),
    [visibleEditions],
  );

  const handleCreated = useCallback(
    (edition: Edition) => {
      queryClient.setQueryData<Edition[]>(contentEditionsQueryKey, (prev = []) => [
        ...prev,
        edition,
      ]);
      setAddModalOpen(false);
      onEditionMutated?.();
    },
    [onEditionMutated, queryClient],
  );

  const handleDeleted = useCallback(
    (id: string) => {
      queryClient.setQueryData<Edition[]>(contentEditionsQueryKey, (prev = []) =>
        prev.filter((edition) => edition.id !== id),
      );
      onEditionMutated?.();
    },
    [onEditionMutated, queryClient],
  );

  const handleUpdated = useCallback(
    (updated: Edition) => {
      queryClient.setQueryData<Edition[]>(contentEditionsQueryKey, (prev = []) =>
        prev.map((edition) => (edition.id === updated.id ? updated : edition)),
      );
      onEditionMutated?.();
    },
    [onEditionMutated, queryClient],
  );

  const handleEventMutation = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: contentEditionsQueryKey });
    onEditionMutated?.();
  }, [onEditionMutated, queryClient]);

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
        <div>
          <h6 className="mb-1 text-primary">{m.admin_content_editions_section()}</h6>
          <ButtonGroup aria-label={m.admin_content_edition_type_filter_aria()}>
            {(["all", "festival", "bourse", "capsule_exchange"] as const).map((type) => (
              <Button
                size="sm"
                key={type}
                variant={editionTypeFilter === type ? "default" : "outline"}
                aria-pressed={editionTypeFilter === type}
                onClick={() => setEditionTypeFilter(type)}
              >
                {editionTypeLabel(type)}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <Button size="sm" variant="outline-primary" onClick={() => setAddModalOpen(true)}>
          <Icon icon={PlusIcon} />
          {m.admin_content_edition_add()}
        </Button>
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
          <p className="text-subtle italic text-sm">{m.admin_content_no_editions()}</p>
        )}
      {!editionsQuery.isPending && !editionsQuery.isError && (
        <div className="flex flex-col gap-4">
          {(["festival", "bourse", "capsule_exchange"] as const).map((type) => {
            const grouped = groupedEditions[type];
            if (grouped.length === 0) return null;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <h6 className="mb-0 text-content">{editionTypeLabel(type)}</h6>
                  <Badge variant="secondary">{grouped.length}</Badge>
                </div>
                {grouped.map((edition) => (
                  <EditionCard
                    key={edition.id}
                    edition={edition}
                    venues={venues}
                    authHeaders={authHeaders}
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
        authHeaders={authHeaders}
        onSaved={handleCreated}
        onHide={() => setAddModalOpen(false)}
      />
    </div>
  );
}

export default function ContentManagement({
  authHeaders,
  venues,
  onExhibitorSaved,
  onExhibitorDeleted,
  captureExhibitorsFence,
  onEditionMutated,
}: ContentManagementProps) {
  return (
    <div>
      <Card tone="secondary" className="mb-4">
        <CardContent>
          <ContentSection
            sectionKey="exhibitors"
            title={m.admin_content_exhibitors_section()}
            authHeaders={authHeaders}
            onItemSaved={onExhibitorSaved}
            onItemDeleted={onExhibitorDeleted}
            captureFence={captureExhibitorsFence}
          />
          <hr className="border-subtle" />
          <EditionsSection
            authHeaders={authHeaders}
            venues={venues}
            onEditionMutated={onEditionMutated}
          />
        </CardContent>
      </Card>
    </div>
  );
}

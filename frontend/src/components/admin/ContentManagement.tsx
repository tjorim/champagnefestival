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
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import Spinner from "react-bootstrap/Spinner";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
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

function typeBadgeVariant(type: string | undefined): string {
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
  onExhibitorSaved?: (item: ItemDraft) => void;
  onExhibitorDeleted?: (id: number) => void;
  onEditionMutated?: () => void;
}

const contentSectionQueryKey = queryKeys.admin.contentManagement.section;
const contentEditionsQueryKey = queryKeys.admin.contentManagement.editions;

interface ContentSectionProps {
  sectionKey: string;
  title: string;
  authHeaders: () => Record<string, string>;
  onItemSaved?: (item: ItemDraft) => void;
  onItemDeleted?: (id: number) => void;
}

export function ContentSection({
  sectionKey,
  title,
  authHeaders,
  onItemSaved,
  onItemDeleted,
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
        onItemSaved?.(saved);
        setModalOpen(false);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : m.admin_content_error_save());
      }
    },
    [onItemSaved, queryClient, saveItemMutation, sectionKey],
  );

  const handleArchive = useCallback(
    async (id: number) => {
      setActionError(null);
      try {
        const saved = await updateItemActiveMutation.mutateAsync({ id, active: false });
        queryClient.setQueryData<ItemDraft[]>(contentSectionQueryKey(sectionKey), (prev = []) =>
          prev.map((item) => (item.id === id ? saved : item)),
        );
        onItemSaved?.(saved);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : m.admin_content_error_save());
      }
    },
    [onItemSaved, queryClient, sectionKey, updateItemActiveMutation],
  );

  const handleRestore = useCallback(
    async (id: number) => {
      setActionError(null);
      try {
        const saved = await updateItemActiveMutation.mutateAsync({ id, active: true });
        queryClient.setQueryData<ItemDraft[]>(contentSectionQueryKey(sectionKey), (prev = []) =>
          prev.map((item) => (item.id === id ? saved : item)),
        );
        onItemSaved?.(saved);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : m.admin_content_error_save());
      }
    },
    [onItemSaved, queryClient, sectionKey, updateItemActiveMutation],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      setActionError(null);
      try {
        await deleteItemMutation.mutateAsync(id);
        queryClient.setQueryData<ItemDraft[]>(contentSectionQueryKey(sectionKey), (prev = []) =>
          prev.filter((item) => item.id !== id),
        );
        onItemDeleted?.(id);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : m.admin_content_error_save());
      }
    },
    [deleteItemMutation, onItemDeleted, queryClient, sectionKey],
  );

  const handleBulkArchive = useCallback(async () => {
    setBulkArchiveInProgress(true);
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
        .forEach((item) => onItemSaved?.({ ...item, active: false }));
    }
    const failedCount = results.filter((r) => r.status === "rejected").length;
    if (failedCount > 0) {
      setActionError(
        m.admin_bulk_content_archive_error({ failed: failedCount, total: snapshot.length }),
      );
    }
    setBulkArchiveInProgress(false);
    setBulkArchiveOpen(false);
  }, [activeItems, onItemSaved, queryClient, sectionKey, updateItemActiveMutation]);

  function renderItemRow(item: ItemDraft, isArchived: boolean) {
    return (
      <ListGroup.Item
        key={item.id}
        className={clsx(
          "bg-dark border-secondary tw:flex tw:justify-between tw:items-center tw:gap-2",
          isArchived && "opacity-50",
        )}
      >
        <span className="tw:flex tw:items-center tw:gap-2 tw:grow tw:truncate">
          {item.image && (
            <span
              className="tw:inline-flex tw:items-center tw:justify-center"
              style={{ width: 32, height: 32, flexShrink: 0 }}
            >
              {imageErrors.has(item.id) ? (
                <span role="img" aria-label={`Image unavailable for ${item.name}`}>
                  🖼
                </span>
              ) : (
                <img
                  src={item.image}
                  alt={item.name}
                  style={{ width: 32, height: 32, objectFit: "contain" }}
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
                  "tw:truncate tw:border-0 tw:bg-transparent tw:p-0 tw:underline tw:decoration-dotted",
                  isArchived ? "tw:text-muted-foreground" : "tw:text-foreground",
                )}
              >
                {item.name}
              </TooltipTrigger>
              <TooltipContent admin>
                {m.admin_content_used_in_editions()}: {editionsByItemId.get(item.id)!.join(", ")}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span
              className={clsx("tw:truncate", isArchived ? "tw:text-subtle" : "tw:text-content")}
            >
              {item.name}
            </span>
          )}
          <Badge
            bg={typeBadgeVariant(item.type)}
            className="tw:shrink-0"
            aria-label={`${m.admin_item_type()}: ${typeLabel(item.type)}`}
          >
            {typeLabel(item.type)}
          </Badge>
          <small className="tw:text-subtle tw:truncate tw:hidden tw:site-md:inline">
            {item.image}
          </small>
          {item.contactPerson && (
            <small className="tw:text-subtle tw:truncate tw:hidden tw:site-lg:inline">
              <Icon icon={UserIcon} className="tw:me-1" />
              {item.contactPerson.name}
            </small>
          )}
        </span>
        <span className="tw:flex tw:gap-1 tw:shrink-0">
          {!isArchived && (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => openEdit(item)}
              aria-label={`Edit ${item.name}`}
            >
              <Icon icon={PencilIcon} />
            </Button>
          )}
          {!isArchived ? (
            <Button
              variant="outline-secondary"
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
      </ListGroup.Item>
    );
  }

  if (itemsQuery.isPending) {
    return (
      <div className="tw:text-center tw:py-4">
        <Spinner animation="border" size="sm" variant="primary" />
        <span className="tw:ms-2 tw:text-subtle">{m.admin_content_loading()}</span>
      </div>
    );
  }

  return (
    <div className="tw:mb-6">
      <div className="tw:flex tw:justify-between tw:items-center tw:mb-2 tw:flex-wrap tw:gap-2">
        <h6 className="tw:mb-0 tw:text-primary">
          {title}
          <Badge bg="secondary" className="tw:ms-2">
            {totalActive}
          </Badge>
          {totalArchived > 0 && (
            <Badge bg="dark" text="secondary" className="tw:ms-1 border border-secondary">
              {totalArchived} {m.admin_content_archived_section()}
            </Badge>
          )}
        </h6>
        <Button variant="outline-primary" size="sm" onClick={openAdd}>
          <Icon icon={PlusIcon} className="tw:me-1" />
          {m.admin_content_add_item()}
        </Button>
      </div>
      <div className="tw:flex tw:flex-wrap tw:gap-2 tw:items-center tw:mb-2">
        <ButtonGroup size="sm">
          {(["all", "producer", "sponsor", "vendor"] as const).map((type) => (
            <Button
              key={type}
              variant={typeFilter === type ? "primary" : "outline-secondary"}
              onClick={() => setTypeFilter(type)}
            >
              {typeLabels[type]}
            </Button>
          ))}
        </ButtonGroup>
        <Form.Control
          size="sm"
          type="search"
          placeholder={m.admin_content_search_placeholder()}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="bg-dark tw:text-content border-secondary"
          style={{ maxWidth: 260 }}
        />
        {typeFilter !== "all" && activeItems.length > 0 && (
          <Button
            size="sm"
            variant="outline-warning"
            onClick={() => setBulkArchiveOpen(true)}
            title={m.admin_bulk_content_archive_all({ type: typeLabels[typeFilter] })}
          >
            <Icon icon={ArchiveIcon} className="tw:me-1" />
            {m.admin_bulk_content_archive_all({ type: typeLabels[typeFilter] })}
          </Button>
        )}
      </div>

      {itemsQuery.isError && (
        <Alert role="alert" aria-live="assertive" variant="danger" className="tw:py-1 tw:mb-2">
          {m.admin_content_error_load()}
        </Alert>
      )}
      {actionError && (
        <Alert
          role="alert"
          aria-live="assertive"
          variant="danger"
          className="tw:py-1 tw:mb-2"
          dismissible
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      )}
      <ListGroup variant="flush">{activeItems.map((item) => renderItemRow(item, false))}</ListGroup>
      {activeItems.length === 0 && archivedItems.length === 0 && (q || typeFilter !== "all") && (
        <div className="tw:text-center tw:py-6 tw:text-subtle">
          <p className="tw:mb-2 tw:text-sm">{m.admin_content_no_results()}</p>
          <Button variant="outline-secondary" size="sm" onClick={handleClearFilters}>
            {m.admin_content_clear_filters()}
          </Button>
        </div>
      )}
      {archivedItems.length > 0 && (
        <div className="tw:mt-2">
          <Button
            variant="link"
            size="sm"
            className="tw:text-subtle tw:px-0"
            onClick={() => setArchivedOpen((value) => !value)}
          >
            <Icon icon={archivedOpen ? ChevronDownIcon : ChevronRightIcon} className="tw:me-1" />
            {m.admin_content_archived_section()}
          </Button>
          {archivedOpen && (
            <ListGroup variant="flush">
              {archivedItems.map((item) => renderItemRow(item, true))}
            </ListGroup>
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
              {bulkArchiveInProgress && (
                <span
                  className="spinner-border spinner-border-sm tw:me-2"
                  role="status"
                  aria-hidden="true"
                />
              )}
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
    <div className="tw:mb-6">
      <div className="tw:flex tw:justify-between tw:items-center tw:mb-2 tw:flex-wrap tw:gap-2">
        <div>
          <h6 className="tw:mb-1 tw:text-primary">{m.admin_content_editions_section()}</h6>
          <ButtonGroup size="sm">
            {(["all", "festival", "bourse", "capsule_exchange"] as const).map((type) => (
              <Button
                key={type}
                variant={editionTypeFilter === type ? "primary" : "outline-secondary"}
                onClick={() => setEditionTypeFilter(type)}
              >
                {editionTypeLabel(type)}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <Button size="sm" variant="outline-primary" onClick={() => setAddModalOpen(true)}>
          <Icon icon={PlusIcon} className="tw:me-1" />
          {m.admin_content_edition_add()}
        </Button>
      </div>

      {editionsQuery.isPending && (
        <div className="tw:text-center tw:py-4">
          <Spinner animation="border" size="sm" variant="primary" />
          <span className="tw:ms-2 tw:text-subtle">{m.admin_content_loading()}</span>
        </div>
      )}
      {!editionsQuery.isPending && editionsQuery.isError && (
        <Alert role="alert" aria-live="assertive" variant="danger" className="tw:py-2 tw:text-sm">
          {m.admin_content_error_load()}
        </Alert>
      )}
      {!editionsQuery.isPending &&
        !editionsQuery.isError &&
        (editionsQuery.data ?? []).length === 0 && (
          <p className="tw:text-subtle fst-italic tw:text-sm">{m.admin_content_no_editions()}</p>
        )}
      {!editionsQuery.isPending && !editionsQuery.isError && (
        <div className="tw:flex tw:flex-col tw:gap-4">
          {(["festival", "bourse", "capsule_exchange"] as const).map((type) => {
            const grouped = groupedEditions[type];
            if (grouped.length === 0) return null;
            return (
              <div key={type}>
                <div className="tw:flex tw:items-center tw:gap-2 tw:mb-2">
                  <h6 className="tw:mb-0 tw:text-content">{editionTypeLabel(type)}</h6>
                  <Badge bg="secondary">{grouped.length}</Badge>
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
  onEditionMutated,
}: ContentManagementProps) {
  return (
    <div>
      <Card bg="dark" text="white" border="secondary" className="tw:mb-4">
        <Card.Body>
          <ContentSection
            sectionKey="exhibitors"
            title={m.admin_content_exhibitors_section()}
            authHeaders={authHeaders}
            onItemSaved={onExhibitorSaved}
            onItemDeleted={onExhibitorDeleted}
          />
          <hr className="border-secondary" />
          <EditionsSection
            authHeaders={authHeaders}
            venues={venues}
            onEditionMutated={onEditionMutated}
          />
        </Card.Body>
      </Card>
    </div>
  );
}

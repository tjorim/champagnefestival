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

function ContentSection({
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

  const itemsQuery = useQuery({
    queryKey: contentSectionQueryKey(sectionKey),
    queryFn: () => fetchContentSectionItems(sectionKey, authHeaders),
    staleTime: 60 * 1000,
    retry: false,
  });

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

  const items = itemsQuery.data ?? [];

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

  function renderItemRow(item: ItemDraft, isArchived: boolean) {
    return (
      <ListGroup.Item
        key={item.id}
        className={clsx(
          "bg-dark border-secondary d-flex justify-content-between align-items-center gap-2",
          isArchived && "opacity-50",
        )}
      >
        <span className="d-flex align-items-center gap-2 flex-grow-1 text-truncate">
          {item.image && (
            <span
              className="d-inline-flex align-items-center justify-content-center"
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
          <span className={clsx("text-truncate", isArchived ? "text-secondary" : "text-light")}>
            {item.name}
          </span>
          <Badge
            bg={typeBadgeVariant(item.type)}
            className="flex-shrink-0"
            aria-label={`${m.admin_item_type()}: ${typeLabel(item.type)}`}
          >
            {typeLabel(item.type)}
          </Badge>
          <small className="text-secondary text-truncate d-none d-md-inline">{item.image}</small>
          {item.contactPerson && (
            <small className="text-secondary text-truncate d-none d-lg-inline">
              <i className="bi bi-person me-1" aria-hidden="true" />
              {item.contactPerson.name}
            </small>
          )}
        </span>
        <span className="d-flex gap-1 flex-shrink-0">
          {!isArchived && (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => openEdit(item)}
              aria-label={`Edit ${item.name}`}
            >
              <i className="bi bi-pencil" aria-hidden="true" />
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
              <i className="bi bi-archive" aria-hidden="true" />
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
                <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                aria-label={`${m.admin_delete()} ${item.name}`}
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </Button>
            </>
          )}
        </span>
      </ListGroup.Item>
    );
  }

  if (itemsQuery.isPending) {
    return (
      <div className="text-center py-3">
        <Spinner animation="border" size="sm" variant="primary" />
        <span className="ms-2 text-secondary">{m.admin_content_loading()}</span>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <h6 className="mb-0 text-warning">
          {title}
          <Badge bg="secondary" className="ms-2">
            {totalActive}
          </Badge>
          {totalArchived > 0 && (
            <Badge bg="dark" text="secondary" className="ms-1 border border-secondary">
              {totalArchived} {m.admin_content_archived_section()}
            </Badge>
          )}
        </h6>
        <Button variant="outline-primary" size="sm" onClick={openAdd}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_content_add_item()}
        </Button>
      </div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <ButtonGroup size="sm">
          {(["all", "producer", "sponsor", "vendor"] as const).map((type) => (
            <Button
              key={type}
              variant={typeFilter === type ? "primary" : "outline-secondary"}
              onClick={() => setTypeFilter(type)}
            >
              {type === "all"
                ? m.admin_filter_all()
                : type === "producer"
                  ? m.admin_item_producer()
                  : type === "sponsor"
                    ? m.admin_item_sponsor()
                    : m.admin_item_vendor()}
            </Button>
          ))}
        </ButtonGroup>
        <Form.Control
          size="sm"
          type="search"
          placeholder={m.admin_content_search_placeholder()}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="bg-dark text-light border-secondary"
          style={{ maxWidth: 260 }}
        />
      </div>

      {itemsQuery.isError && (
        <Alert variant="danger" className="py-1 mb-2">
          {m.admin_content_error_load()}
        </Alert>
      )}
      {actionError && (
        <Alert
          variant="danger"
          className="py-1 mb-2"
          dismissible
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      )}
      <ListGroup variant="flush">{activeItems.map((item) => renderItemRow(item, false))}</ListGroup>
      {activeItems.length === 0 && archivedItems.length === 0 && (q || typeFilter !== "all") && (
        <div className="text-center py-4 text-secondary">
          <p className="mb-2 small">{m.admin_content_no_results()}</p>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleClearFilters}
          >
            {m.admin_content_clear_filters()}
          </Button>
        </div>
      )}
      {archivedItems.length > 0 && (
        <div className="mt-2">
          <Button
            variant="link"
            size="sm"
            className="text-secondary px-0"
            onClick={() => setArchivedOpen((value) => !value)}
          >
            <i
              className={`bi bi-chevron-${archivedOpen ? "down" : "right"} me-1`}
              aria-hidden="true"
            />
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
    </div>
  );
}

interface EditionsSectionProps {
  authHeaders: () => Record<string, string>;
  venues: Venue[];
  onEditionMutated?: () => void;
}

function EditionsSection({ authHeaders, venues, onEditionMutated }: EditionsSectionProps) {
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
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div>
          <h6 className="mb-1 text-warning">{m.admin_content_editions_section()}</h6>
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
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_content_edition_add()}
        </Button>
      </div>

      {editionsQuery.isPending && (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" variant="primary" />
          <span className="ms-2 text-secondary">{m.admin_content_loading()}</span>
        </div>
      )}
      {!editionsQuery.isPending && editionsQuery.isError && (
        <Alert variant="danger" className="py-2 small">
          {m.admin_content_error_load()}
        </Alert>
      )}
      {!editionsQuery.isPending &&
        !editionsQuery.isError &&
        (editionsQuery.data ?? []).length === 0 && (
          <p className="text-secondary fst-italic small">{m.admin_content_no_editions()}</p>
        )}
      {!editionsQuery.isPending && !editionsQuery.isError && (
        <div className="d-flex flex-column gap-3">
          {(["festival", "bourse", "capsule_exchange"] as const).map((type) => {
            const grouped = groupedEditions[type];
            if (grouped.length === 0) return null;
            return (
              <div key={type}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <h6 className="mb-0 text-light">{editionTypeLabel(type)}</h6>
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
      <Card bg="dark" text="white" border="secondary" className="mb-3">
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

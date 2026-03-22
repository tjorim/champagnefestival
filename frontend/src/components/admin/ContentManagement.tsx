/**
 * ContentManagement — admin tab for editing producers, sponsors, and editions.
 */

import clsx from "clsx";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import EditionCard from "./EditionCard";
import EditionModal from "./EditionModal";
import ItemModal from "./ItemModal";
import type { ItemDraft } from "./itemTypes";
import type { Edition } from "./editionTypes";
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

interface ContentManagementProps {
  authHeaders: () => Record<string, string>;
  venues: Venue[];
  onExhibitorSaved?: (item: ItemDraft) => void;
  onExhibitorDeleted?: (id: number) => void;
}

const contentSectionQueryKey = queryKeys.admin.contentManagement.section;
const contentEditionsQueryKey = queryKeys.admin.contentManagement.editions;

// ---------------------------------------------------------------------------
// ContentSection
// ---------------------------------------------------------------------------

interface ContentSectionProps {
  sectionKey: string;
  title: string;
  authHeaders: () => Record<string, string>;
  onItemSaved?: (item: ItemDraft) => void;
  onItemDeleted?: (id: number) => void;
}

function ContentSection({ sectionKey, title, authHeaders, onItemSaved, onItemDeleted }: ContentSectionProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [modalItem, setModalItem] = useState<ItemDraft | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

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
  const activeItems = items.filter((item) => item.active !== false);
  const archivedItems = items.filter((item) => item.active === false);

  function openAdd() {
    setModalItem(null);
    setModalOpen(true);
  }

  function openEdit(item: ItemDraft) {
    setModalItem(item);
    setModalOpen(true);
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
        <Spinner animation="border" size="sm" variant="warning" />
        <span className="ms-2 text-secondary">{m.admin_content_loading()}</span>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0 text-warning">
          {title}
          <Badge bg="secondary" className="ms-2">
            {activeItems.length}
          </Badge>
          {archivedItems.length > 0 && (
            <Badge bg="dark" text="secondary" className="ms-1 border border-secondary">
              {archivedItems.length} {m.admin_content_archived_section()}
            </Badge>
          )}
        </h6>
        <Button variant="outline-secondary" size="sm" onClick={openAdd}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_content_add_item()}
        </Button>
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

      <ListGroup variant="flush" className="mb-2">
        {activeItems.length === 0 ? (
          <ListGroup.Item className="bg-dark text-secondary fst-italic">
            {m.admin_content_no_active_items()}
          </ListGroup.Item>
        ) : (
          activeItems.map((item) => renderItemRow(item, false))
        )}
      </ListGroup>

      {archivedItems.length > 0 && (
        <div className="mb-1">
          <Button
            variant="link"
            size="sm"
            className="text-secondary text-decoration-none p-0 mb-1"
            onClick={() => setArchivedOpen((open) => !open)}
            aria-expanded={archivedOpen}
          >
            <i
              className={`bi bi-chevron-${archivedOpen ? "down" : "right"} me-1`}
              aria-hidden="true"
            />
            {m.admin_content_archived_section()}
            <Badge bg="secondary" className="ms-2">
              {archivedItems.length}
            </Badge>
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

// ---------------------------------------------------------------------------
// EditionsSection — list + add
// ---------------------------------------------------------------------------

interface EditionsSectionProps {
  authHeaders: () => Record<string, string>;
  venues: Venue[];
}

function EditionsSection({ authHeaders, venues }: EditionsSectionProps) {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);

  const editionsQuery = useQuery({
    queryKey: contentEditionsQueryKey,
    queryFn: () => fetchEditions(authHeaders),
    staleTime: 60 * 1000,
    retry: false,
  });

  const editions = editionsQuery.data ?? [];

  const handleCreated = useCallback(
    (edition: Edition) => {
      queryClient.setQueryData<Edition[]>(contentEditionsQueryKey, (prev = []) => [...prev, edition]);
      setAddModalOpen(false);
    },
    [queryClient],
  );

  const handleDeleted = useCallback(
    (id: string) => {
      queryClient.setQueryData<Edition[]>(contentEditionsQueryKey, (prev = []) =>
        prev.filter((edition) => edition.id !== id),
      );
    },
    [queryClient],
  );

  const handleUpdated = useCallback(
    (updated: Edition) => {
      queryClient.setQueryData<Edition[]>(contentEditionsQueryKey, (prev = []) =>
        prev.map((edition) => (edition.id === updated.id ? updated : edition)),
      );
    },
    [queryClient],
  );

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0 text-warning">{m.admin_content_editions_section()}</h6>
        <Button size="sm" variant="outline-secondary" onClick={() => setAddModalOpen(true)}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_content_edition_add()}
        </Button>
      </div>

      {editionsQuery.isPending && (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" variant="warning" />
          <span className="ms-2 text-secondary">{m.admin_content_loading()}</span>
        </div>
      )}
      {!editionsQuery.isPending && editionsQuery.isError && (
        <Alert variant="danger" className="py-2 small">
          {m.admin_content_error_load()}
        </Alert>
      )}
      {!editionsQuery.isPending && !editionsQuery.isError && editions.length === 0 && (
        <p className="text-secondary fst-italic small">No editions yet.</p>
      )}
      {!editionsQuery.isPending &&
        !editionsQuery.isError &&
        editions.map((edition) => (
          <EditionCard
            key={edition.id}
            edition={edition}
            venues={venues}
            authHeaders={authHeaders}
            onDeleted={handleDeleted}
            onUpdated={handleUpdated}
          />
        ))}

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

// ---------------------------------------------------------------------------
// ContentManagement — root export
// ---------------------------------------------------------------------------

export default function ContentManagement({ authHeaders, venues, onExhibitorSaved, onExhibitorDeleted }: ContentManagementProps) {
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
          <EditionsSection authHeaders={authHeaders} venues={venues} />
        </Card.Body>
      </Card>
    </div>
  );
}

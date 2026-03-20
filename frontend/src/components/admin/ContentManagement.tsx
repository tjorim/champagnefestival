/**
 * ContentManagement — admin tab for editing producers, sponsors, and editions.
 */

import { useCallback, useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import EditionCard from "./EditionCard";
import EditionModal from "./EditionModal";
import ItemModal, { type ItemDraft } from "./ItemModal";
import type { Edition } from "./editionTypes";
import type { Venue } from "@/types/admin";

function apiToItemDraft(d: Record<string, unknown>): ItemDraft {
  const cp = (d.contact_person ?? null) as {
    id: string;
    name: string;
    email: string;
    phone: string;
  } | null;
  return {
    id: d.id as number,
    name: d.name as string,
    image: d.image as string,
    website: d.website as string | undefined,
    active: d.active as boolean | undefined,
    type: d.type as string | undefined,
    contactPersonId: (d.contact_person_id as string | null) ?? null,
    contactPerson: cp,
  };
}

interface ContentManagementProps {
  authHeaders: () => Record<string, string>;
  venues: Venue[];
}

// ---------------------------------------------------------------------------
// ContentSection
// ---------------------------------------------------------------------------

interface ContentSectionProps {
  sectionKey: string;
  title: string;
  authHeaders: () => Record<string, string>;
}

function ContentSection({ sectionKey, title, authHeaders }: ContentSectionProps) {
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [modalItem, setModalItem] = useState<ItemDraft | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const activeItems = items.filter((i) => i.active !== false);
  const archivedItems = items.filter((i) => i.active === false);

  const apiBase = `/api/${sectionKey}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(apiBase, { headers: authHeaders() });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as Record<string, unknown>[];
          if (Array.isArray(data)) setItems(data.map(apiToItemDraft));
        } else if (!cancelled) {
          setLoadError(true);
        }
      } catch (err) {
        console.error(`Failed to load ${sectionKey}`, err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sectionKey, apiBase, authHeaders]);

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
        const isNew = !items.find((i) => i.id === draft.id);
        const res = isNew
          ? await fetch(apiBase, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({
                name: draft.name,
                image: draft.image,
                website: draft.website ?? "",
                type: draft.type ?? "vendor",
                contact_person_id: draft.contactPersonId ?? null,
              }),
            })
          : await fetch(`${apiBase}/${draft.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({
                name: draft.name,
                image: draft.image,
                website: draft.website ?? "",
                type: draft.type ?? "vendor",
                contact_person_id: draft.contactPersonId ?? null,
              }),
            });
        if (!res.ok) {
          setActionError(m.admin_content_error_save());
          return;
        }
        const saved = apiToItemDraft((await res.json()) as Record<string, unknown>);
        setItems((prev) => {
          const idx = prev.findIndex((i) => i.id === saved.id);
          return idx >= 0 ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved];
        });
        setImageErrors((prev) => {
          const copy = new Set(prev);
          copy.delete(saved.id);
          return copy;
        });
      } catch {
        setActionError(m.admin_content_error_save());
      }
      setModalOpen(false);
    },
    [items, apiBase, authHeaders],
  );

  const handleArchive = useCallback(
    async (id: number) => {
      setActionError(null);
      try {
        const res = await fetch(`${apiBase}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ active: false }),
        });
        if (res.ok) {
          const saved = (await res.json()) as ItemDraft;
          setItems((prev) => prev.map((i) => (i.id === id ? saved : i)));
        } else {
          setActionError(m.admin_content_error_save());
        }
      } catch {
        setActionError(m.admin_content_error_save());
      }
    },
    [apiBase, authHeaders],
  );

  const handleRestore = useCallback(
    async (id: number) => {
      setActionError(null);
      try {
        const res = await fetch(`${apiBase}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ active: true }),
        });
        if (res.ok) {
          const saved = (await res.json()) as ItemDraft;
          setItems((prev) => prev.map((i) => (i.id === id ? saved : i)));
        } else {
          setActionError(m.admin_content_error_save());
        }
      } catch {
        setActionError(m.admin_content_error_save());
      }
    },
    [apiBase, authHeaders],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      setActionError(null);
      try {
        const res = await fetch(`${apiBase}/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (res.ok || res.status === 204) {
          setItems((prev) => prev.filter((i) => i.id !== id));
        } else {
          const data = await res.json().catch(() => ({}));
          setActionError((data as { detail?: string }).detail ?? m.admin_content_error_save());
        }
      } catch {
        setActionError(m.admin_content_error_save());
      }
    },
    [apiBase, authHeaders],
  );

  function renderItemRow(item: ItemDraft, isArchived: boolean) {
    return (
      <ListGroup.Item
        key={item.id}
        className={`bg-dark border-secondary d-flex justify-content-between align-items-center gap-2${isArchived ? " opacity-50" : ""}`}
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
          <span className={`text-truncate ${isArchived ? "text-secondary" : "text-light"}`}>
            {item.name}
          </span>
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

  if (isLoading) {
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

      {loadError && (
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
            onClick={() => setArchivedOpen((o) => !o)}
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
  const [editions, setEditions] = useState<Edition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(false);
      try {
        const res = await fetch("/api/editions?include_inactive=true", { headers: authHeaders() });
        if (res.ok && !cancelled) setEditions((await res.json()) as Edition[]);
        else if (!cancelled) setLoadError(true);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const handleCreated = useCallback((edition: Edition) => {
    setEditions((prev) => [...prev, edition]);
    setAddModalOpen(false);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setEditions((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleUpdated = useCallback((updated: Edition) => {
    setEditions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }, []);

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0 text-warning">{m.admin_content_editions_section()}</h6>
        <Button size="sm" variant="outline-secondary" onClick={() => setAddModalOpen(true)}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_content_edition_add()}
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" variant="warning" />
          <span className="ms-2 text-secondary">{m.admin_content_loading()}</span>
        </div>
      )}
      {!isLoading && loadError && (
        <Alert variant="danger" className="py-2 small">
          {m.admin_content_error_load()}
        </Alert>
      )}
      {!isLoading && !loadError && editions.length === 0 && (
        <p className="text-secondary fst-italic small">No editions yet.</p>
      )}
      {!isLoading &&
        !loadError &&
        editions.map((ed) => (
          <EditionCard
            key={ed.id}
            edition={ed}
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

export default function ContentManagement({ authHeaders, venues }: ContentManagementProps) {
  return (
    <div>
      <Card bg="dark" text="white" border="secondary" className="mb-3">
        <Card.Body>
          <ContentSection
            sectionKey="exhibitors"
            title={m.admin_content_exhibitors_section()}
            authHeaders={authHeaders}
          />
          <hr className="border-secondary" />
          <EditionsSection authHeaders={authHeaders} venues={venues} />
        </Card.Body>
      </Card>
    </div>
  );
}

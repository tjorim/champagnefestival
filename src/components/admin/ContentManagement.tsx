/**
 * ContentManagement — admin tab for editing producers and sponsors.
 *
 * Loads current content from the backend (falling back to placeholders), lets
 * the admin add, edit, and remove items, then saves via PUT /api/content/{key}.
 * Editions are shown as read-only with a note that a backend editor is planned.
 */

import React, { useCallback, useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import { m } from "../../paraglide/messages";
import { producerItems, sponsorItems } from "../../config/marqueeSlider";
import { editions } from "../../config/editions";

interface ContentManagementProps {
  authHeaders: () => Record<string, string>;
}

type ContentKey = "producers" | "sponsors";

interface ItemDraft {
  id: number;
  name: string;
  image: string;
}

// ---------------------------------------------------------------------------
// ItemEditor — inline add-row
// ---------------------------------------------------------------------------

interface ItemEditorProps {
  onAdd: (item: ItemDraft) => void;
}

function ItemEditor({ onAdd }: ItemEditorProps) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !image.trim()) return;
    onAdd({ id: Date.now(), name: name.trim(), image: image.trim() });
    setName("");
    setImage("");
  }

  return (
    <Form onSubmit={handleSubmit} className="d-flex gap-2 mt-2 flex-wrap">
      <Form.Control
        size="sm"
        placeholder={m.admin_content_name_placeholder()}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="bg-dark text-light border-secondary"
        style={{ minWidth: "180px", flex: "1 1 180px" }}
        required
      />
      <Form.Control
        size="sm"
        placeholder={m.admin_content_image_url_placeholder()}
        value={image}
        onChange={(e) => setImage(e.target.value)}
        className="bg-dark text-light border-secondary"
        style={{ minWidth: "260px", flex: "2 1 260px" }}
        required
      />
      <Button type="submit" size="sm" variant="outline-warning">
        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
        {m.admin_content_add_item()}
      </Button>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// ContentSection — one list (producers or sponsors)
// ---------------------------------------------------------------------------

interface ContentSectionProps {
  sectionKey: ContentKey;
  title: string;
  authHeaders: () => Record<string, string>;
}

function ContentSection({ sectionKey, title, authHeaders }: ContentSectionProps) {
  const fallback = sectionKey === "producers" ? [...producerItems] : [...sponsorItems];

  const [items, setItems] = useState<ItemDraft[]>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // Load from backend; fall back to placeholder on 404 / error
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/content/${sectionKey}`);
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { value: ItemDraft[] };
          if (Array.isArray(data.value)) setItems(data.value);
        }
        // 404 = not saved yet → keep placeholder
      } catch {
        // network error → keep placeholder
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sectionKey]);

  const handleRemove = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSaveStatus("idle");
  }, []);

  const handleAdd = useCallback((item: ItemDraft) => {
    setItems((prev) => [...prev, item]);
    setSaveStatus("idle");
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch(`/api/content/${sectionKey}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ value: items }),
      });
      setSaveStatus(res.ok ? "saved" : "error");
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }, [sectionKey, items, authHeaders]);

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
          <Badge bg="secondary" className="ms-2">{items.length}</Badge>
        </h6>
        <Button
          variant="outline-warning"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />
          ) : (
            <i className="bi bi-floppy me-1" aria-hidden="true" />
          )}
          {m.admin_content_save_section()}
        </Button>
      </div>

      {saveStatus === "saved" && (
        <Alert variant="success" className="py-1 mb-2">{m.admin_content_saved()}</Alert>
      )}
      {saveStatus === "error" && (
        <Alert variant="danger" className="py-1 mb-2">{m.admin_content_error_save()}</Alert>
      )}

      <ListGroup variant="flush" className="mb-2">
        {items.length === 0 ? (
          <ListGroup.Item className="bg-dark text-secondary fst-italic">
            {m.admin_content_fallback_note()}
          </ListGroup.Item>
        ) : (
          items.map((item) => (
            <ListGroup.Item
              key={item.id}
              className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center gap-2"
            >
              <span className="d-flex align-items-center gap-2 flex-grow-1 text-truncate">
                {item.image && (
                  <span className="d-inline-flex align-items-center justify-content-center"
                        style={{ width: 32, height: 32, flexShrink: 0 }}>
                    {imageErrors.has(item.id) ? (
                      <span role="img" aria-label={`Image unavailable for ${item.name}`}>🖼</span>
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
                <span className="text-truncate">{item.name}</span>
                <small className="text-secondary text-truncate d-none d-md-inline">{item.image}</small>
              </span>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => handleRemove(item.id)}
                aria-label={`${m.admin_delete()} ${item.name}`}
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </Button>
            </ListGroup.Item>
          ))
        )}
      </ListGroup>

      <ItemEditor onAdd={handleAdd} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditionsSection — read-only
// ---------------------------------------------------------------------------

function EditionsSection() {
  return (
    <div className="mb-4">
      <h6 className="mb-2 text-warning">{m.admin_content_editions_section()}</h6>
      <Alert variant="secondary" className="py-2 small">
        <i className="bi bi-info-circle me-1" aria-hidden="true" />
        {m.admin_content_editions_note()}
      </Alert>
      <ListGroup variant="flush">
        {editions.map((ed) => (
          <ListGroup.Item
            key={ed.id}
            className="bg-dark text-light border-secondary d-flex justify-content-between"
          >
            <span>
              <strong>{ed.id}</strong>{" "}
              <span className="text-secondary">
                {ed.dates.friday.toLocaleDateString()} –{" "}
                {ed.dates.sunday.toLocaleDateString()}
              </span>
            </span>
            <Badge bg={ed.schedule.length > 0 ? "success" : "secondary"}>
              {ed.schedule.length > 0 ? "Programme set" : "TBD"}
            </Badge>
          </ListGroup.Item>
        ))}
      </ListGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContentManagement — top-level component
// ---------------------------------------------------------------------------

export default function ContentManagement({ authHeaders }: ContentManagementProps) {
  return (
    <div>
      <Card bg="dark" text="white" border="secondary" className="mb-3">
        <Card.Body>
          <ContentSection
            sectionKey="producers"
            title={m.admin_content_producers_section()}
            authHeaders={authHeaders}
          />
          <hr className="border-secondary" />
          <ContentSection
            sectionKey="sponsors"
            title={m.admin_content_sponsors_section()}
            authHeaders={authHeaders}
          />
          <hr className="border-secondary" />
          <EditionsSection />
        </Card.Body>
      </Card>
    </div>
  );
}

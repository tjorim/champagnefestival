import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import EditionModal from "./EditionModal";
import EventModal from "./EventModal";
import { parseEditionDate } from "./editionTypes";
import type { Edition, ScheduleEvent } from "./editionTypes";
import type { Venue } from "@/types/admin";

async function saveEditionSchedule(
  editionId: string,
  schedule: ScheduleEvent[],
  authHeaders: () => Record<string, string>,
): Promise<Edition> {
  const response = await fetch(`/api/editions/${editionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ schedule }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }

  return (await response.json()) as Edition;
}

async function deleteEdition(
  editionId: string,
  authHeaders: () => Record<string, string>,
): Promise<string> {
  const response = await fetch(`/api/editions/${editionId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }

  return editionId;
}

interface EditionCardProps {
  edition: Edition;
  venues: Venue[];
  authHeaders: () => Record<string, string>;
  onDeleted: (id: string) => void;
  onUpdated: (edition: Edition) => void;
}

export default function EditionCard({
  edition,
  venues,
  authHeaders,
  onDeleted,
  onUpdated,
}: EditionCardProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [editionModalOpen, setEditionModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);

  const friday = parseEditionDate(edition.friday);
  const sunday = parseEditionDate(edition.sunday);

  const saveScheduleMutation = useMutation({
    mutationFn: (schedule: ScheduleEvent[]) => saveEditionSchedule(edition.id, schedule, authHeaders),
    retry: false,
  });

  const deleteEditionMutation = useMutation({
    mutationFn: () => deleteEdition(edition.id, authHeaders),
    retry: false,
  });

  async function saveSchedule(newSchedule: ScheduleEvent[]) {
    setSaving(true);
    setSaveError(false);
    try {
      const updatedEdition = await saveScheduleMutation.mutateAsync(newSchedule);
      onUpdated(updatedEdition);
    } catch (error) {
      console.error("Failed to save edition schedule", error);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function openAddEvent() {
    setEditingEvent(null);
    setEventModalOpen(true);
  }
  function openEditEvent(ev: ScheduleEvent) {
    setEditingEvent(ev);
    setEventModalOpen(true);
  }

  function handleEventSaved(ev: ScheduleEvent) {
    const idx = edition.schedule.findIndex((e) => e.id === ev.id);
    const newSchedule =
      idx >= 0 ? edition.schedule.map((e) => (e.id === ev.id ? ev : e)) : [...edition.schedule, ev];
    setEventModalOpen(false);
    saveSchedule(newSchedule);
  }

  function handleRemoveEvent(eventId: string) {
    saveSchedule(edition.schedule.filter((ev) => ev.id !== eventId));
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteEditionMutation.mutateAsync();
      setConfirmDelete(false);
      onDeleted(edition.id);
    } catch (error) {
      console.error("Failed to delete edition", error);
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  }

  const collapseId = `edition-collapse-${edition.id}`;

  return (
    <Card bg="dark" border="secondary" className="mb-2">
      <Card.Header className="d-flex justify-content-between align-items-center gap-2 flex-wrap py-2">
        <Button
          variant="link"
          className="text-warning text-decoration-none p-0 text-start fw-semibold"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={collapseId}
        >
          <i className={`bi bi-chevron-${open ? "down" : "right"} me-2`} aria-hidden="true" />
          {edition.id}
        </Button>
        <span className="text-secondary small">
          {friday.toLocaleDateString()} – {sunday.toLocaleDateString()}
        </span>
        <Badge bg={edition.active ? "success" : "secondary"}>
          {edition.active ? m.admin_content_edition_active() : m.admin_content_edition_inactive()}
        </Badge>
        <Badge bg="secondary">
          {edition.schedule.length} {m.admin_edition_events()}
        </Badge>
        {(edition.producers?.length ?? 0) > 0 && (
          <Badge bg="secondary">
            {edition.producers!.length} {m.admin_edition_producers()}
          </Badge>
        )}
        {(edition.sponsors?.length ?? 0) > 0 && (
          <Badge bg="secondary">
            {edition.sponsors!.length} {m.admin_edition_sponsors()}
          </Badge>
        )}
        {saving && <Spinner animation="border" size="sm" variant="warning" />}
        {saveError && (
          <span className="text-danger small">
            <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
            {m.admin_content_error_save()}
          </span>
        )}
        {deleteError && (
          <span className="text-danger small">
            <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
            {m.admin_content_error_save()}
          </span>
        )}
        {confirmDelete ? (
          <span className="d-flex align-items-center gap-1">
            <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting && (
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-1"
                />
              )}
              {m.admin_action_confirm()}
            </Button>
            <Button size="sm" variant="outline-secondary" onClick={() => setConfirmDelete(false)}>
              {m.admin_action_cancel()}
            </Button>
          </span>
        ) : (
          <span className="d-flex gap-1">
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setEditionModalOpen(true)}
              aria-label={`${m.admin_edit()} ${edition.id}`}
            >
              <i className="bi bi-pencil" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => setConfirmDelete(true)}
              aria-label={`${m.admin_delete()} ${edition.id}`}
            >
              <i className="bi bi-trash" aria-hidden="true" />
            </Button>
          </span>
        )}
      </Card.Header>

      {open && (
        <Card.Body id={collapseId} className="pt-2 pb-2">
          {(() => {
            const venue = venues.find((v) => v.id === edition.venue.id);
            if (!venue) return null;
            return (
              <p className="text-secondary small mb-2">
                <i className="bi bi-geo-alt me-1" aria-hidden="true" />
                {[venue.name, venue.address, venue.city, venue.country].filter(Boolean).join(", ")}
                {!venue.active && (
                  <Badge bg="secondary" className="ms-2 fs-3xs">
                    {m.admin_venue_archived_badge()}
                  </Badge>
                )}
              </p>
            );
          })()}

          <div className="d-flex justify-content-between align-items-center mb-1">
            <h6 className="text-warning mb-0 small">{m.admin_content_edition_schedule()}</h6>
            <Button size="sm" variant="outline-secondary" onClick={openAddEvent}>
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              {m.admin_content_edition_add_event()}
            </Button>
          </div>

          {edition.schedule.length === 0 ? (
            <p className="text-secondary fst-italic small">{m.admin_content_edition_no_events()}</p>
          ) : (
            <ListGroup variant="flush" className="mb-1">
              {edition.schedule.map((ev) => (
                <ListGroup.Item
                  key={ev.id}
                  className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center gap-2 py-1 px-0"
                >
                  <span className="d-flex align-items-center gap-2 flex-wrap">
                    <Badge bg="secondary" className="text-uppercase fs-3xs">
                      {ev.day_id === 1
                        ? m.admin_content_edition_friday()
                        : ev.day_id === 2
                          ? m.admin_content_edition_saturday()
                          : m.admin_content_edition_sunday()}
                    </Badge>
                    <span className="text-secondary small">{ev.start_time}</span>
                    <span>{ev.title}</span>
                    <Badge bg="info" text="dark" className="text-capitalize fs-3xs">
                      {ev.category}
                    </Badge>
                    {ev.registration && (
                      <Badge bg="warning" text="dark" className="fs-3xs">
                        {m.schedule_reservation()}
                      </Badge>
                    )}
                  </span>
                  <span className="d-flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => openEditEvent(ev)}
                      aria-label={`Edit event ${ev.title}`}
                    >
                      <i className="bi bi-pencil" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => handleRemoveEvent(ev.id)}
                      aria-label={`Delete event ${ev.title}`}
                    >
                      <i className="bi bi-trash" aria-hidden="true" />
                    </Button>
                  </span>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Card.Body>
      )}

      <EditionModal
        show={editionModalOpen}
        initial={edition}
        venues={venues}
        authHeaders={authHeaders}
        onSaved={(updated) => {
          onUpdated(updated);
          setEditionModalOpen(false);
        }}
        onHide={() => setEditionModalOpen(false)}
      />
      <EventModal
        show={eventModalOpen}
        initial={editingEvent}
        onSave={handleEventSaved}
        onHide={() => setEventModalOpen(false)}
      />
    </Card>
  );
}

import {
  ChevronDownIcon,
  ChevronRightIcon,
  CoffeeIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  ShoppingBasketIcon,
  TrashIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import {
  deleteEditionById,
  deleteEditionEvent,
  fetchEditionEvents,
  saveEditionEvent,
} from "@/utils/adminContentApi";
import { categoryLabel, useEventCategories } from "@/hooks/useCategories";
import { queryKeys } from "@/utils/queryKeys";
import EditionArtwork from "./EditionArtwork";
import EditionModal from "./EditionModal";
import EditionPollOptionsModal from "./EditionPollOptionsModal";
import EventModal from "./EventModal";
import EventProductsModal from "./EventProductsModal";
import { parseEditionDate, type Edition } from "./editionTypes";
import type { Venue } from "@/types/admin";
import type { Event, EventFormData } from "@/types/event";

interface EditionCardProps {
  edition: Edition;
  venues: Venue[];
  authHeaders: () => Record<string, string>;
  onDeleted: (id: string) => void;
  onUpdated: (edition: Edition) => void;
  onEventMutation?: () => void;
}

function editionTypeBadge(type: Edition["editionType"]): { label: string; bg: BadgeVariant } {
  switch (type) {
    case "bourse":
      return { label: m.admin_edition_type_bourse(), bg: "info" };
    case "capsule_exchange":
      return { label: m.admin_edition_type_capsule_exchange(), bg: "primary" };
    default:
      return { label: m.admin_edition_type_festival(), bg: "warning" };
  }
}

export default function EditionCard({
  edition,
  venues,
  authHeaders,
  onDeleted,
  onUpdated,
  onEventMutation,
}: EditionCardProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [editionModalOpen, setEditionModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [productsModalOpen, setProductsModalOpen] = useState(false);
  const [productsEvent, setProductsEvent] = useState<Event | null>(null);
  const [pollOptionsModalOpen, setPollOptionsModalOpen] = useState(false);
  const editionEventsQueryKey = queryKeys.admin.editionEvents(edition.id);
  const { data: categories } = useEventCategories();

  const eventsQuery = useQuery({
    queryKey: editionEventsQueryKey,
    queryFn: () => fetchEditionEvents(edition.id, authHeaders),
    staleTime: Infinity,
    retry: false,
    enabled: open,
  });

  const deleteEditionMutation = useMutation({
    mutationFn: () => deleteEditionById(edition.id, authHeaders),
    retry: false,
  });
  const saveEventMutation = useMutation({
    mutationFn: ({
      formData,
      editingEventId,
    }: {
      formData: EventFormData;
      editingEventId?: string;
    }) => saveEditionEvent({ editionId: edition.id, editingEventId, formData }, authHeaders),
    retry: false,
  });
  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => deleteEditionEvent(eventId, authHeaders),
    retry: false,
  });

  const sortedEvents = useMemo(
    () =>
      [...(eventsQuery.data ?? edition.events ?? [])].sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      ),
    [eventsQuery.data, edition.events],
  );
  const dates = edition.dates.length > 0 ? edition.dates : sortedEvents.map((event) => event.date);
  const startDate = dates[0] ? parseEditionDate(dates[0]) : null;
  const endDateIso = dates.length > 0 ? dates[dates.length - 1] : undefined;
  const endDate = endDateIso ? parseEditionDate(endDateIso) : null;
  const typeDisplay = editionTypeBadge(edition.editionType);

  function openAddEvent() {
    setEditingEvent(null);
    setEventModalOpen(true);
  }

  function openEditEvent(event: Event) {
    setEditingEvent(event);
    setEventModalOpen(true);
  }

  function openProducts(event: Event) {
    setProductsEvent(event);
    setProductsModalOpen(true);
  }

  async function handleEventSaved(formData: EventFormData) {
    setSaveError("");
    try {
      await saveEventMutation.mutateAsync({ formData, editingEventId: editingEvent?.id });
      queryClient.invalidateQueries({ queryKey: editionEventsQueryKey });
      setEventModalOpen(false);
      await onEventMutation?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : m.admin_content_error_save());
    }
  }

  async function handleRemoveEvent(eventId: string) {
    setSaveError("");
    try {
      await deleteEventMutation.mutateAsync(eventId);
      queryClient.invalidateQueries({ queryKey: editionEventsQueryKey });
      await onEventMutation?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : m.admin_content_error_save());
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteEditionMutation.mutateAsync();
      setConfirmDelete(false);
      onDeleted(edition.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : m.admin_content_error_save());
    } finally {
      setDeleting(false);
    }
  }

  const collapseId = `edition-collapse-${edition.id}`;

  return (
    <Card tone="secondary" className="mb-2">
      <CardHeader className="flex justify-between items-center gap-2 flex-wrap py-2">
        <Button
          variant="link"
          className="text-highlight no-underline p-0 text-left font-semibold"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={collapseId}
        >
          <Icon icon={open ? ChevronDownIcon : ChevronRightIcon} />
          {edition.id}
        </Button>
        <span className="flex items-center gap-2 flex-wrap">
          <Badge variant={typeDisplay.bg}>{typeDisplay.label}</Badge>
          {startDate && endDate ? (
            <span className="text-subtle text-sm">
              {startDate.toLocaleDateString()}
              {startDate.getTime() !== endDate.getTime()
                ? ` – ${endDate.toLocaleDateString()}`
                : ""}
            </span>
          ) : (
            <span className="text-subtle text-sm">{m.admin_edition_dates_defined_by_events()}</span>
          )}
        </span>
        <Badge variant={edition.active ? "success" : "secondary"}>
          {edition.active ? m.admin_content_edition_active() : m.admin_content_edition_inactive()}
        </Badge>
        <Badge variant="secondary">
          {sortedEvents.length} {m.admin_edition_events()}
        </Badge>
        {(edition.producers?.length ?? 0) > 0 && (
          <Badge variant="secondary">
            {edition.producers!.length} {m.admin_edition_producers()}
          </Badge>
        )}
        {(edition.sponsors?.length ?? 0) > 0 && (
          <Badge variant="secondary">
            {edition.sponsors!.length} {m.admin_edition_sponsors()}
          </Badge>
        )}
        {eventsQuery.isFetching && (
          <Spinner label={m.admin_loading_events()} size="sm" variant="warning" />
        )}
        {saveError && (
          <span className="text-destructive text-sm">
            <Icon icon={TriangleAlertIcon} className="me-1" />
            {saveError}
          </span>
        )}
        {deleteError && (
          <span className="text-destructive text-sm">
            <Icon icon={TriangleAlertIcon} className="me-1" />
            {deleteError}
          </span>
        )}
        {confirmDelete ? (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting && <Spinner size="sm" role="status" aria-hidden="true" />}
              {m.admin_action_confirm()}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              {m.admin_action_cancel()}
            </Button>
          </span>
        ) : (
          <span className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPollOptionsModalOpen(true)}
              aria-label={m.admin_poll_modal_title({ edition: edition.id })}
              title={m.admin_poll_modal_title({ edition: edition.id })}
            >
              <Icon icon={CoffeeIcon} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditionModalOpen(true)}
              aria-label={`${m.admin_edit()} ${edition.id}`}
            >
              <Icon icon={PencilIcon} />
            </Button>
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => setConfirmDelete(true)}
              aria-label={`${m.admin_delete()} ${edition.id}`}
            >
              <Icon icon={TrashIcon} />
            </Button>
          </span>
        )}
      </CardHeader>

      {open && (
        <CardContent id={collapseId} className="pt-2 pb-2">
          {(() => {
            const venue = venues.find((value) => value.id === edition.venue.id);
            if (!venue) return null;
            return (
              <p className="text-subtle text-sm mb-2">
                <Icon icon={MapPinIcon} className="me-1" />
                {[venue.name, venue.address, venue.city, venue.country].filter(Boolean).join(", ")}
                {!venue.active && (
                  <Badge variant="secondary" className="ms-2 text-micro">
                    {m.admin_venue_archived_badge()}
                  </Badge>
                )}
              </p>
            );
          })()}

          <EditionArtwork edition={edition} authHeaders={authHeaders} onUpdated={onUpdated} />

          <div className="flex justify-between items-center mb-1">
            <h6 className="text-highlight mb-0 text-sm">{m.admin_content_edition_schedule()}</h6>
            <Button size="sm" variant="outline" onClick={openAddEvent}>
              <Icon icon={PlusIcon} />
              {m.admin_content_edition_add_event()}
            </Button>
          </div>

          {eventsQuery.isPending ? (
            <div className="text-subtle text-sm py-2">
              <Spinner size="sm" className="me-2" />
              {m.admin_loading_events()}
            </div>
          ) : sortedEvents.length === 0 ? (
            <p className="text-subtle italic text-sm">{m.admin_content_edition_no_events()}</p>
          ) : (
            <PresentationList flush className="mb-1">
              {sortedEvents.map((event) => (
                <PresentationListItem
                  key={event.id}
                  className="flex justify-between items-center gap-2 py-1 px-0"
                >
                  <span className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-micro">
                      {event.date}
                    </Badge>
                    <span className="text-subtle text-sm">
                      {event.startTime}
                      {event.endTime ? `–${event.endTime}` : ""}
                    </span>
                    <span>{event.title}</span>
                    <Badge variant="info" className="capitalize text-micro">
                      {categoryLabel(categories, event.category) ?? event.category}
                    </Badge>
                    {event.registrationRequired && (
                      <Badge variant="warning" className="text-micro">
                        {m.schedule_registration()}
                      </Badge>
                    )}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openProducts(event)}
                      aria-label={`${m.admin_content_edition_manage_products()} ${event.title}`}
                      title={m.admin_content_edition_manage_products()}
                    >
                      <Icon icon={ShoppingBasketIcon} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditEvent(event)}
                      aria-label={m.admin_edit_event({ title: event.title })}
                    >
                      <Icon icon={PencilIcon} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => handleRemoveEvent(event.id)}
                      aria-label={m.admin_delete_event({ title: event.title })}
                    >
                      <Icon icon={TrashIcon} />
                    </Button>
                  </span>
                </PresentationListItem>
              ))}
            </PresentationList>
          )}
        </CardContent>
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
        edition={edition}
        initial={editingEvent}
        authHeaders={authHeaders}
        onSave={handleEventSaved}
        onHide={() => setEventModalOpen(false)}
      />
      <EventProductsModal
        show={productsModalOpen}
        event={productsEvent}
        authHeaders={authHeaders}
        onHide={() => setProductsModalOpen(false)}
        onProductsChanged={() => queryClient.invalidateQueries({ queryKey: editionEventsQueryKey })}
      />
      <EditionPollOptionsModal
        show={pollOptionsModalOpen}
        edition={edition}
        authHeaders={authHeaders}
        onHide={() => setPollOptionsModalOpen(false)}
      />
    </Card>
  );
}

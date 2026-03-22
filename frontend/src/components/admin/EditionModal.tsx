import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Select, { type MultiValue, type StylesConfig, type GroupBase } from "react-select";
import { m } from "@/paraglide/messages";
import type { ItemDraft } from "./itemTypes";
import type { Edition } from "./editionTypes";
import type { Venue } from "@/types/admin";
import { queryKeys } from "@/utils/queryKeys";
import { fetchEditionModalExhibitors, saveEdition } from "@/utils/adminContentApi";

interface EditionModalProps {
  show: boolean;
  initial: Edition | null; // null = new edition
  venues: Venue[];
  authHeaders: () => Record<string, string>;
  onSaved: (edition: Edition) => void;
  onHide: () => void;
}

interface ItemOption {
  value: number;
  label: string;
  isArchived: boolean;
}

type ItemSelectStyles = StylesConfig<ItemOption, true, GroupBase<ItemOption>>;

const darkSelectStyles: ItemSelectStyles = {
  control: (base) => ({
    ...base,
    backgroundColor: "#212529",
    borderColor: "#6c757d",
    color: "#f8f9fa",
    minHeight: "34px",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "#212529",
    border: "1px solid #6c757d",
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#343a40" : "#212529",
    color: state.data.isArchived ? "#6c757d" : "#f8f9fa",
    cursor: "pointer",
  }),
  multiValue: (base, state) => ({
    ...base,
    backgroundColor: state.data.isArchived ? "#343a40" : "#495057",
  }),
  multiValueLabel: (base, state) => ({
    ...base,
    color: state.data.isArchived ? "#adb5bd" : "#f8f9fa",
    fontSize: "0.8rem",
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "#adb5bd",
    ":hover": { backgroundColor: "#dc3545", color: "white" },
  }),
  input: (base) => ({ ...base, color: "#f8f9fa" }),
  placeholder: (base) => ({ ...base, color: "#6c757d" }),
  indicatorSeparator: (base) => ({ ...base, backgroundColor: "#6c757d" }),
  dropdownIndicator: (base) => ({ ...base, color: "#6c757d" }),
  clearIndicator: (base) => ({ ...base, color: "#6c757d" }),
  groupHeading: (base) => ({ ...base, color: "#adb5bd", fontSize: "0.7rem" }),
  noOptionsMessage: (base) => ({ ...base, color: "#adb5bd" }),
};

const editionModalExhibitorsQueryKey = queryKeys.admin.editionModalExhibitors;

function toOptions(items: ItemDraft[]): { active: ItemOption[]; archived: ItemOption[] } {
  const active: ItemOption[] = [];
  const archived: ItemOption[] = [];
  for (const item of items) {
    const opt: ItemOption = { value: item.id, label: item.name, isArchived: item.active === false };
    if (item.active === false) archived.push(opt);
    else active.push(opt);
  }
  return { active, archived };
}

export default function EditionModal({
  show,
  initial,
  venues,
  authHeaders,
  onSaved,
  onHide,
}: EditionModalProps) {
  // Keep a stable ref to venues so the open-modal effect can read the
  // current list without listing venues as a dependency (which would reset
  // the whole form whenever a venue is added or archived while the modal is open).
  const venuesRef = useRef(venues);
  venuesRef.current = venues;

  const [id, setId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState("");
  const [friday, setFriday] = useState("");
  const [saturday, setSaturday] = useState("");
  const [sunday, setSunday] = useState("");
  const [venueId, setVenueId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExhibitors, setSelectedExhibitors] = useState<MultiValue<ItemOption>>([]);

  useEffect(() => {
    if (!show) return;
    setId(initial?.id ?? "");
    setYear(initial?.year ?? new Date().getFullYear());
    setMonth(initial?.month ?? "");
    setFriday(initial?.friday ?? "");
    setSaturday(initial?.saturday ?? "");
    setSunday(initial?.sunday ?? "");
    setVenueId(initial?.venue?.id ?? venuesRef.current.find((v) => v.active)?.id ?? "");
    setActive(initial?.active ?? true);
    setError(null);

    // Pre-seed selections immediately from initial data so the select isn't empty while loading
    if (initial) {
      const preseeded = [...(initial.producers ?? []), ...(initial.sponsors ?? [])].map((e) => ({
        value: e.id,
        label: e.name,
        isArchived: false,
      }));
      setSelectedExhibitors(preseeded);
    } else {
      setSelectedExhibitors([]);
    }
  }, [show, initial]);

  const exhibitorsQuery = useQuery({
    queryKey: editionModalExhibitorsQueryKey,
    queryFn: () => fetchEditionModalExhibitors(authHeaders),
    enabled: show,
    staleTime: 60 * 1000,
    retry: false,
  });

  const saveEditionMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      year: number;
      month: string;
      friday: string;
      saturday: string;
      sunday: string;
      venueId: string;
      active: boolean;
      exhibitorIds: number[];
    }) => saveEdition(payload, authHeaders, initial?.id),
    retry: false,
  });

  const allExhibitors = useMemo(() => exhibitorsQuery.data ?? [], [exhibitorsQuery.data]);

  // Sync selections once pool is loaded
  useEffect(() => {
    if (allExhibitors.length === 0) return;
    const ids = new Set(
      [...(initial?.producers ?? []), ...(initial?.sponsors ?? [])].map((e) => e.id),
    );
    const { active: act, archived: arch } = toOptions(allExhibitors);
    setSelectedExhibitors([...act, ...arch].filter((o) => ids.has(o.value)));
  }, [allExhibitors, initial]);

  const isEdit = !!initial;

  // Only producers and sponsors can be linked to editions; vendors are excluded.
  const programmableExhibitors = allExhibitors.filter(
    (exhibitor) => exhibitor.type === "producer" || exhibitor.type === "sponsor",
  );

  const exhibitorGroups = useMemo(() => {
    const { active: act, archived: arch } = toOptions(programmableExhibitors);
    const groups: GroupBase<ItemOption>[] = [];
    if (act.length) groups.push({ label: m.admin_edition_exhibitors(), options: act });
    if (arch.length) groups.push({ label: m.admin_content_archived_section(), options: arch });
    return groups;
  }, [programmableExhibitors]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!month.trim() || !friday || !saturday || !sunday || !venueId) return;

    // When creating a new edition, reject whitespace-only IDs
    if (!isEdit && id.trim() === "") {
      setError("ID cannot be empty or whitespace only");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const savedEdition = await saveEditionMutation.mutateAsync({
        id: id.trim(),
        year,
        month: month.trim(),
        friday,
        saturday,
        sunday,
        venueId,
        active,
        exhibitorIds: selectedExhibitors.map((option: ItemOption) => option.value),
      });

      onSaved(savedEdition);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : m.admin_content_error_save(),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered size="lg" data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          {isEdit ? `Edit ${initial!.id}` : m.admin_content_edition_add()}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body className="bg-dark">
          {error && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {error}
            </Alert>
          )}

          {!isEdit && (
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary small mb-1">ID</Form.Label>
              <Form.Control
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder="e.g. 2026-march"
                required
                autoFocus
              />
            </Form.Group>
          )}

          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group style={{ maxWidth: "100px" }}>
              <Form.Label className="text-secondary small mb-1">Year</Form.Label>
              <Form.Control
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-dark text-light border-secondary"
                required
              />
            </Form.Group>
            <Form.Group style={{ minWidth: "140px", flex: "1 1 140px" }}>
              <Form.Label className="text-secondary small mb-1">Month</Form.Label>
              <Form.Control
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder="e.g. march"
                required
              />
            </Form.Group>
            <Form.Check
              type="checkbox"
              id="modal-edition-active"
              label={m.admin_content_edition_active()}
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="text-light align-self-end mb-1"
            />
          </div>

          <div className="d-flex gap-3 flex-wrap mb-3">
            <Form.Group>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_edition_friday()}
              </Form.Label>
              <Form.Control
                type="date"
                value={friday}
                onChange={(e) => setFriday(e.target.value)}
                className="bg-dark text-light border-secondary"
                required
              />
            </Form.Group>
            <Form.Group>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_edition_saturday()}
              </Form.Label>
              <Form.Control
                type="date"
                value={saturday}
                onChange={(e) => setSaturday(e.target.value)}
                className="bg-dark text-light border-secondary"
                required
              />
            </Form.Group>
            <Form.Group>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_edition_sunday()}
              </Form.Label>
              <Form.Control
                type="date"
                value={sunday}
                onChange={(e) => setSunday(e.target.value)}
                className="bg-dark text-light border-secondary"
                required
              />
            </Form.Group>
          </div>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_content_edition_venue()}
            </Form.Label>
            <Form.Select
              size="sm"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="bg-dark text-light border-secondary"
              required
            >
              {venues
                .filter((v) => v.active || v.id === venueId)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.city ? ` (${v.city})` : ""}
                    {!v.active ? ` — ${m.admin_venue_archived_badge()}` : ""}
                  </option>
                ))}
            </Form.Select>
          </Form.Group>

          <Form.Group>
            <Form.Label className="text-secondary small mb-1">
              {m.admin_content_edition_exhibitors_label()}
            </Form.Label>
            {exhibitorsQuery.isError && (
              <Alert variant="danger" className="py-1 mb-2 small">
                {m.admin_content_error_load()}
              </Alert>
            )}
            <Select<ItemOption, true, GroupBase<ItemOption>>
              isMulti
              options={exhibitorGroups}
              value={selectedExhibitors}
              onChange={setSelectedExhibitors}
              styles={darkSelectStyles}
              isLoading={exhibitorsQuery.isFetching}
              placeholder={m.admin_content_edition_exhibitors_placeholder()}
              classNamePrefix="rs"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>
            {m.close()}
          </Button>
          <Button type="submit" variant="warning" size="sm" disabled={saving || !venueId}>
            {saving ? (
              <Spinner
                as="span"
                animation="border"
                size="sm"
                role="status"
                aria-hidden="true"
                className="me-1"
              />
            ) : (
              <i className="bi bi-floppy me-1" aria-hidden="true" />
            )}
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
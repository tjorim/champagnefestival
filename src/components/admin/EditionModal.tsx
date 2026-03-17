import React, { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Select, { type MultiValue, type StylesConfig, type GroupBase } from "react-select";
import { m } from "../../paraglide/messages";
import type { ItemDraft } from "./ItemModal";
import type { Edition } from "./editionTypes";
import type { Venue } from "../../types/admin";

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

  const [allProducers, setAllProducers] = useState<ItemDraft[]>([]);
  const [allSponsors, setAllSponsors] = useState<ItemDraft[]>([]);
  const [selectedProducers, setSelectedProducers] = useState<MultiValue<ItemOption>>([]);
  const [selectedSponsors, setSelectedSponsors] = useState<MultiValue<ItemOption>>([]);

  useEffect(() => {
    if (!show) return;
    setId(initial?.id ?? "");
    setYear(initial?.year ?? new Date().getFullYear());
    setMonth(initial?.month ?? "");
    setFriday(initial?.friday ?? "");
    setSaturday(initial?.saturday ?? "");
    setSunday(initial?.sunday ?? "");
    setVenueId(initial?.venue_id ?? venuesRef.current.find((v) => v.active)?.id ?? "");
    setActive(initial?.active ?? true);
    setError(null);

    // Fetch item pools when the modal opens
    async function fetchItems() {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch("/api/content/producers"),
          fetch("/api/content/sponsors"),
        ]);
        if (pRes.ok) {
          const pData = (await pRes.json()) as { value: ItemDraft[] };
          if (Array.isArray(pData.value)) setAllProducers(pData.value);
        }
        if (sRes.ok) {
          const sData = (await sRes.json()) as { value: ItemDraft[] };
          if (Array.isArray(sData.value)) setAllSponsors(sData.value);
        }
      } catch {
        // non-critical; selects will just be empty
      }
    }
    fetchItems();
  }, [show, initial]);

  // Sync selections once pools are loaded
  useEffect(() => {
    if (allProducers.length === 0) return;
    const ids = new Set((initial?.producers ?? []).map((p) => p.id));
    const { active: act, archived: arch } = toOptions(allProducers);
    setSelectedProducers([...act, ...arch].filter((o) => ids.has(o.value)));
  }, [allProducers, initial]);

  useEffect(() => {
    if (allSponsors.length === 0) return;
    const ids = new Set((initial?.sponsors ?? []).map((s) => s.id));
    const { active: act, archived: arch } = toOptions(allSponsors);
    setSelectedSponsors([...act, ...arch].filter((o) => ids.has(o.value)));
  }, [allSponsors, initial]);

  const isEdit = !!initial;

  const producerGroups = (() => {
    const { active: act, archived: arch } = toOptions(allProducers);
    const groups = [];
    if (act.length) groups.push({ label: m.admin_content_producers_section(), options: act });
    if (arch.length) groups.push({ label: m.admin_content_archived_section(), options: arch });
    return groups;
  })();

  const sponsorGroups = (() => {
    const { active: act, archived: arch } = toOptions(allSponsors);
    const groups = [];
    if (act.length) groups.push({ label: m.admin_content_sponsors_section(), options: act });
    if (arch.length) groups.push({ label: m.admin_content_archived_section(), options: arch });
    return groups;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!month.trim() || !friday || !saturday || !sunday || !venueId) return;
    setSaving(true);
    setError(null);
    try {
      const url = isEdit ? `/api/editions/${initial!.id}` : "/api/editions";
      const method = isEdit ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        year,
        month: month.trim(),
        friday,
        saturday,
        sunday,
        venue_id: venueId,
        active,
        producers: selectedProducers.map((o: ItemOption) => o.value),
        sponsors: selectedSponsors.map((o: ItemOption) => o.value),
      };
      if (!isEdit) body.id = id.trim();
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSaved((await res.json()) as Edition);
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { detail?: string }).detail ?? m.admin_content_error_save());
      }
    } catch {
      setError(m.admin_content_error_save());
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

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_content_edition_producers_label()}
            </Form.Label>
            <Select<ItemOption, true, GroupBase<ItemOption>>
              isMulti
              options={producerGroups}
              value={selectedProducers}
              onChange={setSelectedProducers}
              styles={darkSelectStyles}
              placeholder={m.admin_content_edition_producers_placeholder()}
              classNamePrefix="rs"
            />
          </Form.Group>

          <Form.Group>
            <Form.Label className="text-secondary small mb-1">
              {m.admin_content_edition_sponsors_label()}
            </Form.Label>
            <Select<ItemOption, true, GroupBase<ItemOption>>
              isMulti
              options={sponsorGroups}
              value={selectedSponsors}
              onChange={setSelectedSponsors}
              styles={darkSelectStyles}
              placeholder={m.admin_content_edition_sponsors_placeholder()}
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

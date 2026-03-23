import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Select, { type GroupBase, type MultiValue, type StylesConfig } from "react-select";
import { m } from "@/paraglide/messages";
import type { ItemDraft } from "./itemTypes";
import type { Edition, EditionType } from "./editionTypes";
import type { Venue } from "@/types/admin";
import { queryKeys } from "@/utils/queryKeys";
import { fetchEditionModalExhibitors, saveEdition } from "@/utils/adminContentApi";

interface EditionModalProps {
  show: boolean;
  initial: Edition | null;
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
  control: (base) => ({ ...base, backgroundColor: "#212529", borderColor: "#6c757d", color: "#f8f9fa", minHeight: "34px" }),
  menu: (base) => ({ ...base, backgroundColor: "#212529", border: "1px solid #6c757d", zIndex: 9999 }),
  option: (base, state) => ({ ...base, backgroundColor: state.isFocused ? "#343a40" : "#212529", color: state.data.isArchived ? "#6c757d" : "#f8f9fa", cursor: "pointer" }),
  multiValue: (base, state) => ({ ...base, backgroundColor: state.data.isArchived ? "#343a40" : "#495057" }),
  multiValueLabel: (base, state) => ({ ...base, color: state.data.isArchived ? "#adb5bd" : "#f8f9fa", fontSize: "0.8rem" }),
  multiValueRemove: (base) => ({ ...base, color: "#adb5bd", ":hover": { backgroundColor: "#dc3545", color: "white" } }),
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

function typeLabel(type: EditionType) {
  switch (type) {
    case "bourse":
      return "Bourse";
    case "capsule_exchange":
      return "Capsule Exchange";
    default:
      return "Festival";
  }
}

export default function EditionModal({ show, initial, venues, authHeaders, onSaved, onHide }: EditionModalProps) {
  const venuesRef = useRef(venues);
  venuesRef.current = venues;
  const hydratedRef = useRef(false);

  const [id, setId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState("");
  const [editionType, setEditionType] = useState<EditionType>("festival");
  const [venueId, setVenueId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExhibitors, setSelectedExhibitors] = useState<MultiValue<ItemOption>>([]);
  const [externalPartner, setExternalPartner] = useState("");
  const [externalContactName, setExternalContactName] = useState("");
  const [externalContactEmail, setExternalContactEmail] = useState("");

  useEffect(() => {
    if (!show) return;
    hydratedRef.current = false;
    setId(initial?.id ?? "");
    setYear(initial?.year ?? new Date().getFullYear());
    setMonth(initial?.month ?? "");
    setEditionType(initial?.editionType ?? "festival");
    setVenueId(initial?.venue?.id ?? venuesRef.current.find((v) => v.active)?.id ?? "");
    setActive(initial?.active ?? true);
    setError(null);
    setExternalPartner(initial?.externalPartner ?? "");
    setExternalContactName(initial?.externalContactName ?? "");
    setExternalContactEmail(initial?.externalContactEmail ?? "");

    if (initial) {
      const preseeded = [...(initial.producers ?? []), ...(initial.sponsors ?? [])].map((e) => ({ value: e.id, label: e.name, isArchived: false }));
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
    mutationFn: (payload: { id: string; year: number; month: string; editionType: EditionType; venueId: string; active: boolean; exhibitorIds: number[]; externalPartner?: string; externalContactName?: string; externalContactEmail?: string; }) => saveEdition(payload, authHeaders, initial?.id),
    retry: false,
  });

  const allExhibitors = useMemo(() => exhibitorsQuery.data ?? [], [exhibitorsQuery.data]);

  useEffect(() => {
    if (allExhibitors.length === 0 || hydratedRef.current) return;
    const ids = new Set([...(initial?.producers ?? []), ...(initial?.sponsors ?? [])].map((e) => e.id));
    const { active: act, archived: arch } = toOptions(allExhibitors);
    setSelectedExhibitors([...act, ...arch].filter((o) => ids.has(o.value)));
    hydratedRef.current = true;
  }, [allExhibitors, initial]);

  const isEdit = !!initial;
  const isFestival = editionType === "festival";
  const programmableExhibitors = allExhibitors.filter((exhibitor) => exhibitor.type === "producer" || exhibitor.type === "sponsor");
  const exhibitorGroups = useMemo(() => {
    const { active: act, archived: arch } = toOptions(programmableExhibitors);
    const groups: GroupBase<ItemOption>[] = [];
    if (act.length) groups.push({ label: m.admin_edition_exhibitors(), options: act });
    if (arch.length) groups.push({ label: m.admin_content_archived_section(), options: arch });
    return groups;
  }, [programmableExhibitors]);

  const previewDates = useMemo(() => initial?.dates ?? [], [initial?.dates]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!month.trim() || !venueId) return;
    if (!isEdit && id.trim() === "") {
      setError("ID cannot be empty or whitespace only");
      return;
    }

    try {
      const savedEdition = await saveEditionMutation.mutateAsync({
        id: id.trim(),
        year,
        month: month.trim(),
        editionType,
        venueId,
        active,
        exhibitorIds: editionType === "festival" ? selectedExhibitors.map((option: ItemOption) => option.value) : [],
        externalPartner,
        externalContactName,
        externalContactEmail,
      });
      onSaved(savedEdition);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : m.admin_content_error_save());
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered size="lg" data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">{isEdit ? `Edit ${initial!.id}` : m.admin_content_edition_add()}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body className="bg-dark">
          {error && <Alert variant="danger" className="py-1 mb-3 small">{error}</Alert>}

          {!isEdit && (
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary small mb-1">ID</Form.Label>
              <Form.Control value={id} onChange={(e) => setId(e.target.value)} className="bg-dark text-light border-secondary" placeholder="e.g. 2026-march" required autoFocus />
            </Form.Group>
          )}

          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group style={{ maxWidth: "100px" }}>
              <Form.Label className="text-secondary small mb-1">Year</Form.Label>
              <Form.Control type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-dark text-light border-secondary" required />
            </Form.Group>
            <Form.Group style={{ minWidth: "140px", flex: "1 1 140px" }}>
              <Form.Label className="text-secondary small mb-1">Month</Form.Label>
              <Form.Control value={month} onChange={(e) => setMonth(e.target.value)} className="bg-dark text-light border-secondary" placeholder="e.g. march" required />
            </Form.Group>
            <Form.Group style={{ minWidth: "180px", flex: "1 1 180px" }}>
              <Form.Label className="text-secondary small mb-1">Edition type</Form.Label>
              <Form.Select value={editionType} onChange={(e) => setEditionType(e.target.value as EditionType)} className="bg-dark text-light border-secondary">
                <option value="festival">Festival</option>
                <option value="bourse">Bourse</option>
                <option value="capsule_exchange">Capsule Exchange</option>
              </Form.Select>
            </Form.Group>
            <Form.Check type="checkbox" id="modal-edition-active" label={m.admin_content_edition_active()} checked={active} onChange={(e) => setActive(e.target.checked)} className="text-light align-self-end mb-1" />
          </div>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small mb-1">Venue</Form.Label>
            <Form.Select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="bg-dark text-light border-secondary" required>
              <option value="">Select a venue</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}{venue.active ? "" : " (archived)"}</option>
              ))}
            </Form.Select>
          </Form.Group>

          <div className="border border-secondary rounded p-3 mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="text-light small fw-semibold">{typeLabel(editionType)} date handling</div>
              <span className="text-secondary small">Dates are driven by the relational event records.</span>
            </div>
            {isFestival ? (
              <div className="row g-2">
                {['Friday', 'Saturday', 'Sunday'].map((label, index) => (
                  <div className="col-md-4" key={label}>
                    <Form.Label className="text-secondary small mb-1">{label}</Form.Label>
                    <Form.Control type="date" value={previewDates[index] ?? ''} className="bg-dark text-light border-secondary" readOnly disabled={!previewDates[index]} />
                  </div>
                ))}
              </div>
            ) : (
              <Form.Group>
                <Form.Label className="text-secondary small mb-1">Edition date</Form.Label>
                <Form.Control type="date" value={previewDates[0] ?? ''} className="bg-dark text-light border-secondary" readOnly disabled={!previewDates[0]} />
              </Form.Group>
            )}
            <div className="text-secondary small mt-2">
              {isEdit ? 'Update event dates from the Events section below each edition card.' : 'Create the edition first, then add events to define its dates.'}
            </div>
          </div>

          {!isFestival && (
            <div className="border border-secondary rounded p-3 mb-3">
              <div className="text-light small fw-semibold mb-2">External partner</div>
              <div className="row g-2">
                <div className="col-md-6">
                  <Form.Label className="text-secondary small mb-1">Partner</Form.Label>
                  <Form.Control value={externalPartner} onChange={(e) => setExternalPartner(e.target.value)} className="bg-dark text-light border-secondary" placeholder="Partner organisation" />
                </div>
                <div className="col-md-3">
                  <Form.Label className="text-secondary small mb-1">Contact name</Form.Label>
                  <Form.Control value={externalContactName} onChange={(e) => setExternalContactName(e.target.value)} className="bg-dark text-light border-secondary" placeholder="Jane Doe" />
                </div>
                <div className="col-md-3">
                  <Form.Label className="text-secondary small mb-1">Contact email</Form.Label>
                  <Form.Control type="email" value={externalContactEmail} onChange={(e) => setExternalContactEmail(e.target.value)} className="bg-dark text-light border-secondary" placeholder="jane@example.com" />
                </div>
              </div>
            </div>
          )}

          {isFestival && (
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary small mb-1">Festival exhibitors</Form.Label>
              {exhibitorsQuery.isPending ? (
                <div className="text-secondary small"><Spinner animation="border" size="sm" className="me-2" />Loading exhibitors…</div>
              ) : (
                <Select<ItemOption, true>
                  isMulti
                  closeMenuOnSelect={false}
                  styles={darkSelectStyles}
                  options={exhibitorGroups}
                  value={selectedExhibitors}
                  onChange={setSelectedExhibitors}
                  classNamePrefix="rs"
                  placeholder={m.admin_edition_exhibitors()}
                />
              )}
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>{m.close()}</Button>
          <Button type="submit" variant="warning" size="sm" disabled={saveEditionMutation.isPending}>
            {saveEditionMutation.isPending ? <Spinner as="span" animation="border" size="sm" className="me-1" /> : <i className="bi bi-floppy me-1" aria-hidden="true" />}
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

import React, { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { m } from "../../paraglide/messages";
import type { Edition } from "./editionTypes";

interface EditionModalProps {
  show: boolean;
  initial: Edition | null; // null = new edition
  authHeaders: () => Record<string, string>;
  onSaved: (edition: Edition) => void;
  onHide: () => void;
}

export default function EditionModal({ show, initial, authHeaders, onSaved, onHide }: EditionModalProps) {
  const [id, setId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState("");
  const [friday, setFriday] = useState("");
  const [saturday, setSaturday] = useState("");
  const [sunday, setSunday] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venuePostalCode, setVenuePostalCode] = useState("");
  const [venueCountry, setVenueCountry] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (show) {
      setId(initial?.id ?? "");
      setYear(initial?.year ?? new Date().getFullYear());
      setMonth(initial?.month ?? "");
      setFriday(initial?.friday ?? "");
      setSaturday(initial?.saturday ?? "");
      setSunday(initial?.sunday ?? "");
      setVenueName(initial?.venue_name ?? "");
      setVenueAddress(initial?.venue_address ?? "");
      setVenueCity(initial?.venue_city ?? "");
      setVenuePostalCode(initial?.venue_postal_code ?? "");
      setVenueCountry(initial?.venue_country ?? "");
      setActive(initial?.active ?? true);
      setError(null);
    }
  }, [show, initial]);

  const isEdit = !!initial;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!month.trim() || !friday || !saturday || !sunday) return;
    setSaving(true);
    setError(null);
    try {
      const url = isEdit ? `/api/editions/${initial!.id}` : "/api/editions";
      const method = isEdit ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        year, month: month.trim(), friday, saturday, sunday,
        venue_name: venueName.trim(), venue_address: venueAddress.trim(),
        venue_city: venueCity.trim(), venue_postal_code: venuePostalCode.trim(),
        venue_country: venueCountry.trim(), active,
      };
      if (!isEdit) body.id = id.trim();
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
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
          {error && <Alert variant="danger" className="py-1 mb-3 small">{error}</Alert>}

          {!isEdit && (
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary small mb-1">ID</Form.Label>
              <Form.Control
                value={id} onChange={(e) => setId(e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder="e.g. 2026-march" required autoFocus
              />
            </Form.Group>
          )}

          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group style={{ maxWidth: "100px" }}>
              <Form.Label className="text-secondary small mb-1">Year</Form.Label>
              <Form.Control
                type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
                className="bg-dark text-light border-secondary" required
              />
            </Form.Group>
            <Form.Group style={{ minWidth: "140px", flex: "1 1 140px" }}>
              <Form.Label className="text-secondary small mb-1">Month</Form.Label>
              <Form.Control
                value={month} onChange={(e) => setMonth(e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder="e.g. march" required
              />
            </Form.Group>
            <Form.Check
              type="checkbox" id="modal-edition-active"
              label={m.admin_content_edition_active()}
              checked={active} onChange={(e) => setActive(e.target.checked)}
              className="text-light align-self-end mb-1"
            />
          </div>

          <div className="d-flex gap-3 flex-wrap mb-3">
            <Form.Group>
              <Form.Label className="text-secondary small mb-1">{m.admin_content_edition_friday()}</Form.Label>
              <Form.Control type="date" value={friday} onChange={(e) => setFriday(e.target.value)} className="bg-dark text-light border-secondary" required />
            </Form.Group>
            <Form.Group>
              <Form.Label className="text-secondary small mb-1">{m.admin_content_edition_saturday()}</Form.Label>
              <Form.Control type="date" value={saturday} onChange={(e) => setSaturday(e.target.value)} className="bg-dark text-light border-secondary" required />
            </Form.Group>
            <Form.Group>
              <Form.Label className="text-secondary small mb-1">{m.admin_content_edition_sunday()}</Form.Label>
              <Form.Control type="date" value={sunday} onChange={(e) => setSunday(e.target.value)} className="bg-dark text-light border-secondary" required />
            </Form.Group>
          </div>

          <h6 className="text-secondary small mb-2">{m.admin_content_edition_venue()}</h6>
          <div className="d-flex gap-2 flex-wrap mb-2">
            <Form.Control size="sm" placeholder="Venue name" value={venueName} onChange={(e) => setVenueName(e.target.value)} className="bg-dark text-light border-secondary" style={{ minWidth: "180px", flex: "2 1 180px" }} />
            <Form.Control size="sm" placeholder="Address" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} className="bg-dark text-light border-secondary" style={{ minWidth: "180px", flex: "2 1 180px" }} />
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <Form.Control size="sm" placeholder="City" value={venueCity} onChange={(e) => setVenueCity(e.target.value)} className="bg-dark text-light border-secondary" style={{ minWidth: "120px", flex: "1 1 120px" }} />
            <Form.Control size="sm" placeholder="Postal code" value={venuePostalCode} onChange={(e) => setVenuePostalCode(e.target.value)} className="bg-dark text-light border-secondary" style={{ maxWidth: "110px" }} />
            <Form.Control size="sm" placeholder="Country" value={venueCountry} onChange={(e) => setVenueCountry(e.target.value)} className="bg-dark text-light border-secondary" style={{ minWidth: "110px", flex: "1 1 110px" }} />
          </div>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>Cancel</Button>
          <Button type="submit" variant="warning" size="sm" disabled={saving}>
            {saving
              ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />
              : <i className="bi bi-floppy me-1" aria-hidden="true" />}
            Save
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

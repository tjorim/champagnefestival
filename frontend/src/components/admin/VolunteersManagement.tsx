import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";
import VolunteerFormModal, { type VolunteerFormData } from "./VolunteerFormModal";

interface VolunteersManagementProps {
  volunteers: Person[];
  isLoading: boolean;
  onCreate: (data: VolunteerFormData) => Promise<void>;
  onUpdate: (id: string, data: VolunteerFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type ActiveFilter = "all" | "active" | "inactive";

export default function VolunteersManagement({
  volunteers,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
}: VolunteersManagementProps) {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Person | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const filtered =
    q.trim() || activeFilter !== "all"
      ? volunteers.filter((volunteer) => {
          const s = q.trim().toLowerCase();
          const matchesQ =
            !s ||
            volunteer.name.toLowerCase().includes(s) ||
            volunteer.address.toLowerCase().includes(s) ||
            (volunteer.nationalRegisterNumber ?? "").toLowerCase().includes(s) ||
            (volunteer.eidDocumentNumber ?? "").toLowerCase().includes(s);
          const matchesActive =
            activeFilter === "all" ||
            (activeFilter === "active" ? volunteer.active : !volunteer.active);
          return matchesQ && matchesActive;
        })
      : volunteers;

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(deletingId);
      setDeleteSuccess(true);
      setDeletingId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : m.admin_volunteers_error_delete());
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveVolunteer = async (data: VolunteerFormData) => {
    if (editingVolunteer) {
      await onUpdate(editingVolunteer.id, data);
      setUpdateSuccess(true);
    } else {
      await onCreate(data);
      setCreateSuccess(true);
    }
  };

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <span className="fw-semibold">{m.admin_volunteers_tab()}</span>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <Form.Select
              size="sm"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 180 }}
              aria-label={m.admin_people_active_label()}
            >
              <option value="all">{m.admin_volunteers_filter_all()}</option>
              <option value="active">{m.admin_volunteers_filter_active()}</option>
              <option value="inactive">{m.admin_volunteers_filter_inactive()}</option>
            </Form.Select>
            <Form.Control
              size="sm"
              type="search"
              placeholder={m.admin_volunteers_search_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 280 }}
            />
            <Button
              size="sm"
              variant="warning"
              onClick={() => {
                setEditingVolunteer(null);
                setShowForm(true);
              }}
            >
              <i className="bi bi-hand-thumbs-up me-1" aria-hidden="true" />
              {m.admin_volunteers_add()}
            </Button>
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {createSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setCreateSuccess(false)}
            >
              {m.admin_volunteers_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setUpdateSuccess(false)}
            >
              {m.admin_volunteers_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setDeleteSuccess(false)}
            >
              {m.admin_volunteers_delete_success()}
            </Alert>
          )}

          {isLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="warning" size="sm" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">
              {m.admin_volunteers_no_results()}
            </p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <thead>
                  <tr>
                    <th>{m.reservation_name()}</th>
                    <th>{m.admin_people_address_label()}</th>
                    <th>{m.admin_people_national_register_number_label()}</th>
                    <th>{m.admin_people_eid_document_number_label()}</th>
                    <th>{m.admin_people_first_help_day_label()}</th>
                    <th>{m.admin_people_last_help_day_label()}</th>
                    <th>{m.admin_actions_label()}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((volunteer) => (
                    <tr key={volunteer.id}>
                      <td>
                        <div className="fw-semibold d-flex align-items-center gap-1">
                          {volunteer.name}
                          {!volunteer.active && (
                            <Badge bg="secondary" className="ms-1">
                              {m.admin_people_inactive_badge_label()}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="small">{volunteer.address}</td>
                      <td className="small">{volunteer.nationalRegisterNumber}</td>
                      <td className="small">{volunteer.eidDocumentNumber}</td>
                      <td className="small">{volunteer.firstHelpDay}</td>
                      <td className="small">{volunteer.lastHelpDay}</td>
                      <td>
                        <div className="d-flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline-light"
                            onClick={() => {
                              setEditingVolunteer(volunteer);
                              setShowForm(true);
                            }}
                            title={m.admin_volunteers_edit_title()}
                            aria-label={m.admin_volunteers_edit_title()}
                          >
                            <i className="bi bi-pencil" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => {
                              setDeletingId(volunteer.id);
                              setDeleteError("");
                            }}
                            title={m.admin_volunteers_delete_title()}
                            aria-label={m.admin_volunteers_delete_title()}
                          >
                            <i className="bi bi-trash" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      {deletingId && (
        <Modal show onHide={() => setDeletingId(null)} centered data-bs-theme="dark">
          <Modal.Header closeButton className="bg-dark border-secondary">
            <Modal.Title className="text-danger fs-6">
              <i className="bi bi-trash me-2" aria-hidden="true" />
              {m.admin_volunteers_delete_title()}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark text-light">
            {deleteError && <Alert variant="danger">{deleteError}</Alert>}
            <p>{m.admin_volunteers_delete_confirm()}</p>
          </Modal.Body>
          <Modal.Footer className="bg-dark border-secondary">
            <Button variant="outline-secondary" size="sm" onClick={() => setDeletingId(null)}>
              {m.admin_action_cancel()}
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? (
                <Spinner as="span" animation="border" size="sm" className="me-1" />
              ) : (
                <i className="bi bi-trash me-1" aria-hidden="true" />
              )}
              {m.admin_action_confirm()}
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      <VolunteerFormModal
        show={showForm}
        volunteer={editingVolunteer}
        onSave={handleSaveVolunteer}
        onHide={() => {
          setShowForm(false);
          setEditingVolunteer(null);
        }}
      />
    </>
  );
}

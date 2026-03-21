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
import MemberFormModal, { type MemberFormData } from "./MemberFormModal";

interface MembersManagementProps {
  members: Person[];
  reservationCountByPersonId: Record<string, number>;
  isLoading: boolean;
  onCreate: (data: MemberFormData) => Promise<void>;
  onUpdate: (id: string, data: MemberFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type ActiveFilter = "all" | "active" | "inactive";

function truncateText(value: string, limit = 80): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

export default function MembersManagement({
  members,
  reservationCountByPersonId,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
}: MembersManagementProps) {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Person | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const filtered =
    q.trim() || activeFilter !== "all"
      ? members.filter((member) => {
          const s = q.trim().toLowerCase();
          const phoneQ = s.replace(/[\s\-().+]/g, "");
          const matchesQ =
            !s ||
            member.name.toLowerCase().includes(s) ||
            member.email.toLowerCase().includes(s) ||
            (phoneQ.length > 0 && member.phone.replace(/[\s\-().+]/g, "").includes(phoneQ)) ||
            member.address.toLowerCase().includes(s) ||
            member.clubName.toLowerCase().includes(s) ||
            member.notes.toLowerCase().includes(s);
          const matchesActive =
            activeFilter === "all" ||
            (activeFilter === "active" ? member.active : !member.active);
          return matchesQ && matchesActive;
        })
      : members;

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(deletingId);
      setDeleteSuccess(true);
      setDeletingId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : m.admin_members_error_delete());
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveMember = async (data: MemberFormData) => {
    if (editingMember) {
      await onUpdate(editingMember.id, data);
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
          <span className="fw-semibold">{m.admin_members_tab()}</span>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <Form.Select
              size="sm"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 180 }}
              aria-label={m.admin_people_active_label()}
            >
              <option value="all">{m.admin_members_filter_all()}</option>
              <option value="active">{m.admin_members_filter_active()}</option>
              <option value="inactive">{m.admin_members_filter_inactive()}</option>
            </Form.Select>
            <Form.Control
              size="sm"
              type="search"
              placeholder={m.admin_members_search_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 280 }}
            />
            <Button
              size="sm"
              variant="warning"
              onClick={() => {
                setEditingMember(null);
                setShowForm(true);
              }}
            >
              <i className="bi bi-person-badge me-1" aria-hidden="true" />
              {m.admin_members_add()}
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
              {m.admin_members_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setUpdateSuccess(false)}
            >
              {m.admin_members_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setDeleteSuccess(false)}
            >
              {m.admin_members_delete_success()}
            </Alert>
          )}

          {isLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="warning" size="sm" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_members_no_results()}</p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <caption className="visually-hidden">{m.admin_members_table_caption()}</caption>
                <thead>
                  <tr>
                    <th>{m.reservation_name()}</th>
                    <th>{m.reservation_email()}</th>
                    <th>{m.reservation_phone()}</th>
                    <th>{m.admin_people_club_name_label()}</th>
                    <th>{m.reservation_notes()}</th>
                    <th>{m.admin_reservations_tab()}</th>
                    <th>{m.admin_actions_label()}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((member) => {
                    const notesPreview = truncateText(member.notes);
                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="fw-semibold d-flex align-items-center gap-1">
                            {member.name}
                            {!member.active && (
                              <Badge bg="secondary" className="ms-1">
                                {m.admin_people_inactive_badge_label()}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="small">{member.email || "—"}</td>
                        <td className="small">{member.phone || "—"}</td>
                        <td className="small">{member.clubName || "—"}</td>
                        <td className="small text-secondary" title={member.notes || undefined}>
                          {notesPreview || "—"}
                        </td>
                        <td className="small">{reservationCountByPersonId[member.id] ?? 0}</td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline-light"
                              onClick={() => {
                                setEditingMember(member);
                                setShowForm(true);
                              }}
                              title={m.admin_members_edit_title()}
                              aria-label={m.admin_members_edit_title()}
                            >
                              <i className="bi bi-pencil" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => {
                                setDeletingId(member.id);
                                setDeleteError("");
                              }}
                              title={m.admin_members_delete_title()}
                              aria-label={m.admin_members_delete_title()}
                            >
                              <i className="bi bi-trash" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      {deletingId && (
        <Modal
          show
          onHide={() => {
            if (!deleting) setDeletingId(null);
          }}
          centered
          data-bs-theme="dark"
        >
          <Modal.Header closeButton className="bg-dark border-secondary">
            <Modal.Title className="fs-6 text-warning">
              {m.admin_members_delete_title()}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark">
            {deleteError && (
              <Alert variant="danger" className="py-2 small">
                {deleteError}
              </Alert>
            )}
            <p>{m.admin_members_delete_confirm()}</p>
          </Modal.Body>
          <Modal.Footer className="bg-dark border-secondary">
            <Button
              variant="outline-secondary"
              onClick={() => setDeletingId(null)}
              disabled={deleting}
            >
              {m.admin_action_cancel()}
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  {m.admin_delete()}
                </>
              ) : (
                <>
                  <i className="bi bi-trash me-1" aria-hidden="true" />
                  {m.admin_members_delete_title()}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      <MemberFormModal
        show={showForm}
        member={editingMember}
        onSave={handleSaveMember}
        onHide={() => {
          setShowForm(false);
          setEditingMember(null);
        }}
      />
    </>
  );
}

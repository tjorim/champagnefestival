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

interface PeopleManagementProps {
  people: Person[];
  reservationCountByPersonId: Record<string, number>;
  isLoading: boolean;
  onMerge: (canonicalId: string, duplicateId: string) => Promise<void>;
}

interface MergeState {
  canonical: Person;
  duplicate: Person;
}

export default function PeopleManagement({
  people,
  reservationCountByPersonId,
  isLoading,
  onMerge,
}: PeopleManagementProps) {
  const [q, setQ] = useState("");
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [mergeSuccess, setMergeSuccess] = useState(false);

  const filtered = q.trim()
    ? people.filter((p) => {
        const s = q.toLowerCase();
        return (
          p.name.toLowerCase().includes(s) ||
          p.email.toLowerCase().includes(s) ||
          p.phone.includes(s)
        );
      })
    : people;

  // Group people by email to surface duplicates
  const emailGroups = new Map<string, Person[]>();
  for (const p of people) {
    if (!p.email) continue;
    const key = p.email.toLowerCase();
    const group = emailGroups.get(key) ?? [];
    group.push(p);
    emailGroups.set(key, group);
  }
  const duplicateEmails = new Set(
    [...emailGroups.entries()].filter(([, g]) => g.length > 1).map(([email]) => email),
  );

  const handleMergeConfirm = async () => {
    if (!mergeState) return;
    setMerging(true);
    setMergeError("");
    try {
      await onMerge(mergeState.canonical.id, mergeState.duplicate.id);
      setMergeSuccess(true);
      setMergeState(null);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : m.admin_people_merge_error());
    } finally {
      setMerging(false);
    }
  };

  const openMerge = (a: Person, b: Person) => {
    // Default: keep the one with more reservations as canonical
    const aCount = reservationCountByPersonId[a.id] ?? 0;
    const bCount = reservationCountByPersonId[b.id] ?? 0;
    setMergeState({ canonical: aCount >= bCount ? a : b, duplicate: aCount >= bCount ? b : a });
    setMergeError("");
    setMergeSuccess(false);
  };

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <span className="fw-semibold">{m.admin_people_tab()}</span>
          <Form.Control
            size="sm"
            type="search"
            placeholder={m.admin_search_person_placeholder()}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-dark text-light border-secondary"
            style={{ maxWidth: 280 }}
          />
        </Card.Header>

        <Card.Body className="p-0">
          {mergeSuccess && (
            <Alert
              variant="success"
              dismissible
              className="m-3 mb-0"
              onClose={() => setMergeSuccess(false)}
            >
              {m.admin_people_merge_success()}
            </Alert>
          )}

          {isLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="warning" size="sm" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_people_no_results()}</p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <thead>
                  <tr>
                    <th>{m.reservation_name()}</th>
                    <th className="d-none d-md-table-cell">{m.reservation_email()}</th>
                    <th className="d-none d-lg-table-cell">{m.reservation_phone()}</th>
                    <th className="d-none d-lg-table-cell">{m.admin_people_roles_label()}</th>
                    <th>{m.admin_reservations_tab()}</th>
                    <th>{m.admin_actions_label()}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((person) => {
                    const isDuplicate = person.email && duplicateEmails.has(person.email.toLowerCase());
                    const duplicates = isDuplicate
                      ? (emailGroups.get(person.email.toLowerCase()) ?? []).filter(
                          (p) => p.id !== person.id,
                        )
                      : [];
                    const resCount = reservationCountByPersonId[person.id] ?? 0;

                    return (
                      <tr key={person.id}>
                        <td>
                          <div className="fw-semibold d-flex align-items-center gap-1">
                            {person.name}
                            {!person.active && (
                              <Badge bg="secondary" className="ms-1">
                                inactive
                              </Badge>
                            )}
                          </div>
                          {isDuplicate && (
                            <div className="text-warning small">
                              <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
                              {m.admin_people_duplicates_same_email()}
                            </div>
                          )}
                        </td>
                        <td className="d-none d-md-table-cell small">{person.email}</td>
                        <td className="d-none d-lg-table-cell small">{person.phone}</td>
                        <td className="d-none d-lg-table-cell">
                          <div className="d-flex flex-wrap gap-1">
                            {person.roles.map((role) => (
                              <Badge key={role} bg="secondary" className="text-capitalize">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td>
                          <Badge bg={resCount > 0 ? "warning" : "secondary"} text={resCount > 0 ? "dark" : undefined}>
                            {resCount}
                          </Badge>
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {duplicates.map((dup) => (
                              <Button
                                key={dup.id}
                                size="sm"
                                variant="outline-warning"
                                onClick={() => openMerge(person, dup)}
                                title={`${m.admin_people_merge_title()}: ${dup.name}`}
                              >
                                <i className="bi bi-person-fill-gear me-1" aria-hidden="true" />
                                {m.admin_people_merge_title()}
                              </Button>
                            ))}
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

      {mergeState && (
        <Modal
          show
          onHide={() => setMergeState(null)}
          centered
          aria-labelledby="merge-modal-title"
        >
          <Modal.Header closeButton className="bg-dark text-light border-secondary">
            <Modal.Title id="merge-modal-title">
              <i className="bi bi-person-fill-gear me-2" aria-hidden="true" />
              {m.admin_people_merge_title()}
            </Modal.Title>
          </Modal.Header>

          <Modal.Body className="bg-dark text-light">
            {mergeError && <Alert variant="danger">{mergeError}</Alert>}

            <p className="text-secondary small mb-3">{m.admin_people_duplicates_same_email()}</p>

            {(["canonical", "duplicate"] as const).map((role) => {
              const person = mergeState[role];
              const resCount = reservationCountByPersonId[person.id] ?? 0;
              const label =
                role === "canonical"
                  ? m.admin_people_merge_into()
                  : m.admin_people_merge_discard();
              const variant = role === "canonical" ? "success" : "danger";

              return (
                <Card key={role} bg="dark" border={variant} className="mb-3">
                  <Card.Header className={`border-${variant} text-${variant} small fw-semibold d-flex justify-content-between`}>
                    <span>{label}</span>
                    <Button
                      size="sm"
                      variant={`outline-${variant}`}
                      onClick={() =>
                        setMergeState({ canonical: mergeState.duplicate, duplicate: mergeState.canonical })
                      }
                    >
                      <i className="bi bi-arrow-left-right" aria-hidden="true" />
                    </Button>
                  </Card.Header>
                  <Card.Body className="py-2 small">
                    <div className="fw-semibold">{person.name}</div>
                    <div className="text-secondary">{person.email}</div>
                    {person.phone && <div className="text-secondary">{person.phone}</div>}
                    <div className="mt-1">
                      <Badge bg={resCount > 0 ? "warning" : "secondary"} text={resCount > 0 ? "dark" : undefined}>
                        {resCount} {m.admin_people_reservations_count()}
                      </Badge>
                      {person.roles.map((r) => (
                        <Badge key={r} bg="secondary" className="ms-1 text-capitalize">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </Card.Body>
                </Card>
              );
            })}
          </Modal.Body>

          <Modal.Footer className="bg-dark border-secondary">
            <Button variant="outline-secondary" onClick={() => setMergeState(null)}>
              {m.close()}
            </Button>
            <Button variant="warning" onClick={handleMergeConfirm} disabled={merging}>
              {merging ? (
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
              ) : (
                <>
                  <i className="bi bi-person-fill-gear me-1" aria-hidden="true" />
                  {m.admin_people_merge_confirm()}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}

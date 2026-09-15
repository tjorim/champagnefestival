import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  createPollOption,
  deletePollOption,
  fetchEditionPollOptions,
  updatePollOption,
  type PollOption,
  type PollOptionKind,
} from "@/utils/adminContentApi";
import { queryKeys } from "@/utils/queryKeys";
import type { Edition } from "./editionTypes";

interface EditionPollOptionsModalProps {
  show: boolean;
  edition: Edition | null;
  authHeaders: () => Record<string, string>;
  onHide: () => void;
}

const KINDS: PollOptionKind[] = ["dish", "soup", "dinner"];

function kindLabel(kind: PollOptionKind): string {
  switch (kind) {
    case "dish":
      return m.admin_poll_kind_dish();
    case "soup":
      return m.admin_poll_kind_soup();
    default:
      return m.admin_poll_kind_dinner();
  }
}

export default function EditionPollOptionsModal({
  show,
  edition,
  authHeaders,
  onHide,
}: EditionPollOptionsModalProps) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [error, setError] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<PollOptionKind>("dish");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const editionId = edition?.id ?? "";
  const queryKey = queryKeys.admin.editionPollOptions(editionId);

  const optionsQuery = useQuery({
    queryKey,
    queryFn: () => fetchEditionPollOptions(editionId, authHeaders),
    enabled: show && Boolean(editionId),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { kind: PollOptionKind; label: string }) =>
      createPollOption({ editionId, kind: payload.kind, label: payload.label }, authHeaders),
    retry: false,
    onSuccess: (created) => {
      queryClient.setQueryData<PollOption[]>(queryKey, (prev = []) => [...prev, created]);
      setNewLabel("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; label: string }) =>
      updatePollOption(payload.id, payload.label, authHeaders),
    retry: false,
    onSuccess: (updated) => {
      queryClient.setQueryData<PollOption[]>(queryKey, (prev = []) =>
        prev.map((o) => (o.id === updated.id ? updated : o)),
      );
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePollOption(id, authHeaders),
    retry: false,
  });

  const options = optionsQuery.data ?? [];

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!newLabel.trim()) return;
    try {
      await createMutation.mutateAsync({ kind: newKind, label: newLabel.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  async function handleSaveEdit(id: string) {
    setError("");
    if (!editingLabel.trim()) return;
    try {
      await updateMutation.mutateAsync({ id, label: editingLabel.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  async function handleDelete(option: PollOption) {
    const confirmed = await confirm({
      title: m.admin_poll_delete_title(),
      body: m.admin_poll_delete_body({ label: option.label }),
      errorFallback: m.admin_content_error_save(),
      variant: "danger",
    });
    if (!confirmed) return;
    setError("");
    try {
      await deleteMutation.mutateAsync(option.id);
      queryClient.setQueryData<PollOption[]>(queryKey, (prev = []) =>
        prev.filter((o) => o.id !== option.id),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton className="bg-dark text-light border-secondary">
        <Modal.Title>{m.admin_poll_modal_title({ edition: edition?.id ?? "" })}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light">
        <p className="small text-secondary">{m.admin_poll_modal_description()}</p>
        {error && <Alert variant="danger">{error}</Alert>}
        {optionsQuery.isPending ? (
          <div className="d-flex justify-content-center py-3">
            <Spinner animation="border" size="sm" />
          </div>
        ) : optionsQuery.isError ? (
          <Alert variant="danger">{m.admin_content_error_load()}</Alert>
        ) : (
          KINDS.map((kind) => {
            const kindOptions = options.filter((o) => o.kind === kind);
            return (
              <div key={kind} className="mb-4">
                <h3 className="h6">{kindLabel(kind)}</h3>
                {kindOptions.length === 0 ? (
                  <p className="small text-secondary">{m.admin_poll_no_options()}</p>
                ) : (
                  <ListGroup className="mb-2">
                    {kindOptions.map((option) => (
                      <ListGroup.Item
                        key={option.id}
                        className="bg-dark text-light border-secondary d-flex align-items-center gap-2"
                      >
                        {editingId === option.id ? (
                          <>
                            <Form.Control
                              size="sm"
                              className="bg-dark text-light border-secondary"
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              maxLength={200}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="outline-primary"
                              disabled={updateMutation.isPending}
                              onClick={() => handleSaveEdit(option.id)}
                            >
                              {m.admin_save()}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={() => setEditingId(null)}
                            >
                              {m.admin_action_cancel()}
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="flex-grow-1">{option.label}</span>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={() => {
                                setEditingId(option.id);
                                setEditingLabel(option.label);
                              }}
                            >
                              {m.admin_edit()}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={deleteMutation.isPending}
                              onClick={() => handleDelete(option)}
                            >
                              {m.admin_delete()}
                            </Button>
                          </>
                        )}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                )}
              </div>
            );
          })
        )}
        <Form
          onSubmit={handleAdd}
          className="d-flex gap-2 align-items-end flex-wrap border-top border-secondary pt-3"
        >
          <Form.Group controlId="poll-option-add-kind">
            <Form.Label className="small text-secondary mb-1">
              {m.admin_poll_add_kind_label()}
            </Form.Label>
            <Form.Select
              size="sm"
              className="bg-dark text-light border-secondary"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as PollOptionKind)}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabel(kind)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group controlId="poll-option-add-label" className="flex-grow-1">
            <Form.Label className="small text-secondary mb-1">
              {m.admin_poll_add_label_label()}
            </Form.Label>
            <Form.Control
              size="sm"
              className="bg-dark text-light border-secondary"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={200}
            />
          </Form.Group>
          <Button
            type="submit"
            size="sm"
            variant="outline-primary"
            disabled={createMutation.isPending}
          >
            {m.admin_poll_add_button()}
          </Button>
        </Form>
      </Modal.Body>
      {confirmDialog}
    </Modal>
  );
}

/**
 * FaqManagement — CRUD for the public FAQ section's question/answer pairs.
 *
 * Self-contained (own query + mutations, like AuditLogViewer/EditionsSection)
 * rather than wired through the central useAdminQueries/useAdminVenueActions
 * stack, since it's a single flat resource with no cross-entity dependencies.
 */

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { FaqItem } from "@/types/admin";
import { fetchFaqItemsAdmin } from "@/utils/adminFetch";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { invalidateAdmin } from "@/utils/queryInvalidation";

interface FaqManagementProps {
  authHeaders: () => Record<string, string>;
}

const emptyForm = { question: "", answer: "" };

export default function FaqManagement({ authHeaders }: FaqManagementProps) {
  const queryClient = useQueryClient();
  const faqItemsQueryKey = queryKeys.admin.faqItems;

  const faqItemsQuery = useQuery({
    queryKey: faqItemsQueryKey,
    queryFn: () => fetchFaqItemsAdmin(authHeaders),
  });
  const faqItems = useMemo(() => faqItemsQuery.data ?? [], [faqItemsQuery.data]);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: { question: string; answer: string; sortOrder: number }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/faq",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            question: data.question,
            answer: data.answer,
            sort_order: data.sortOrder,
          }),
        },
        m.admin_error_add_faq_item(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [faqItemsQueryKey, queryKeys.faq]),
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<FaqItem, "id">> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/faq/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...(data.question !== undefined && { question: data.question }),
            ...(data.answer !== undefined && { answer: data.answer }),
            ...(data.sortOrder !== undefined && { sort_order: data.sortOrder }),
            ...(data.active !== undefined && { active: data.active }),
          }),
        },
        m.admin_error_update_faq_item(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [faqItemsQueryKey, queryKeys.faq]),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/faq/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_faq_item(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [faqItemsQueryKey, queryKeys.faq]),
    retry: false,
  });

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((item: FaqItem) => {
    setEditingId(item.id);
    setForm({ question: item.question, answer: item.answer });
    setError(null);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.question.trim()) {
      setError(m.admin_faq_question_required());
      return;
    }
    if (!form.answer.trim()) {
      setError(m.admin_faq_answer_required());
      return;
    }
    setError(null);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          data: { question: form.question.trim(), answer: form.answer.trim() },
        });
      } else {
        const nextSortOrder = faqItems.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;
        await createMutation.mutateAsync({
          question: form.question.trim(),
          answer: form.answer.trim(),
          sortOrder: nextSortOrder,
        });
      }
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [form, editingId, faqItems, createMutation, updateMutation]);

  const handleToggleActive = useCallback(
    async (item: FaqItem) => {
      setRowError(null);
      try {
        await updateMutation.mutateAsync({ id: item.id, data: { active: !item.active } });
      } catch (err) {
        setRowError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [updateMutation],
  );

  const handleDelete = useCallback(
    async (item: FaqItem) => {
      if (!window.confirm(m.admin_faq_delete_confirm())) return;
      setRowError(null);
      try {
        await deleteMutation.mutateAsync(item.id);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [deleteMutation],
  );

  const handleMove = useCallback(
    async (item: FaqItem, direction: "up" | "down") => {
      const sorted = [...faqItems].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = sorted.findIndex((i) => i.id === item.id);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      const swapWith = sorted[swapIndex];
      if (!swapWith) return;
      setRowError(null);
      // Sequential, not Promise.all: if the second write fails after the
      // first succeeds, both rows would otherwise share one sort_order
      // (ambiguous order, and the next move on either item becomes a no-op
      // since they compare equal). Roll the first write back instead.
      await updateMutation.mutateAsync({ id: item.id, data: { sortOrder: swapWith.sortOrder } });
      try {
        await updateMutation.mutateAsync({ id: swapWith.id, data: { sortOrder: item.sortOrder } });
      } catch (err) {
        try {
          await updateMutation.mutateAsync({ id: item.id, data: { sortOrder: item.sortOrder } });
        } catch {
          // Rollback failure doesn't get to hide the original error.
        }
        setRowError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [faqItems, updateMutation],
  );

  const sortedItems = useMemo(
    () => [...faqItems].sort((a, b) => a.sortOrder - b.sortOrder),
    [faqItems],
  );

  const isMutating = updateMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="d-flex align-items-center justify-content-between">
          <span className="fw-semibold">{m.admin_content_faq_section()}</span>
          <Button variant="outline-warning" size="sm" onClick={openAdd}>
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            {m.admin_add_faq_item()}
          </Button>
        </Card.Header>
        <Card.Body className="p-0">
          {rowError && (
            <Alert variant="danger" className="m-3 py-1 small">
              {rowError}
            </Alert>
          )}
          {faqItemsQuery.isError ? (
            <Alert variant="danger" className="m-3 py-1 small">
              {m.admin_error_load_data()}
            </Alert>
          ) : faqItemsQuery.isPending ? (
            <div className="text-center py-5">
              <Spinner animation="border" size="sm" role="status">
                <span className="visually-hidden">{m.admin_loading()}</span>
              </Spinner>
            </div>
          ) : sortedItems.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_no_faq_items()}</p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover className="mb-0" size="sm">
                <tbody>
                  {sortedItems.map((item, index) => (
                    <tr key={item.id} className={!item.active ? "opacity-50" : undefined}>
                      <td style={{ width: "1%", whiteSpace: "nowrap" }}>
                        <div className="d-flex flex-column">
                          <Button
                            size="sm"
                            variant="link"
                            className="p-0 text-light"
                            disabled={index === 0 || isMutating}
                            onClick={() => handleMove(item, "up")}
                            aria-label={m.admin_faq_move_up()}
                            title={m.admin_faq_move_up()}
                          >
                            <i className="bi bi-caret-up-fill" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="link"
                            className="p-0 text-light"
                            disabled={index === sortedItems.length - 1 || isMutating}
                            onClick={() => handleMove(item, "down")}
                            aria-label={m.admin_faq_move_down()}
                            title={m.admin_faq_move_down()}
                          >
                            <i className="bi bi-caret-down-fill" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                      <td>
                        <div className="fw-semibold">
                          {item.question}
                          {!item.active && (
                            <Badge bg="secondary" className="ms-2 fs-2xs">
                              {m.admin_venue_archived_badge()}
                            </Badge>
                          )}
                        </div>
                        <div className="text-secondary small">{item.answer}</div>
                      </td>
                      <td style={{ width: "1%", whiteSpace: "nowrap" }}>
                        <div className="d-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            disabled={isMutating}
                            onClick={() => openEdit(item)}
                            aria-label={m.admin_edit()}
                            title={m.admin_edit()}
                          >
                            <i className="bi bi-pencil" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            disabled={isMutating}
                            onClick={() => handleToggleActive(item)}
                            aria-label={item.active ? m.admin_content_archive() : m.admin_content_restore()}
                            title={item.active ? m.admin_content_archive() : m.admin_content_restore()}
                          >
                            <i
                              className={item.active ? "bi bi-eye-slash" : "bi bi-eye"}
                              aria-hidden="true"
                            />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            disabled={isMutating}
                            onClick={() => handleDelete(item)}
                            aria-label={m.admin_delete()}
                            title={m.admin_delete()}
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

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title>{editingId ? m.admin_edit_faq_item() : m.admin_add_faq_item()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {error && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {error}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="faq-question">
            <Form.Label>{m.admin_faq_question_label()}</Form.Label>
            <Form.Control
              type="text"
              value={form.question}
              onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <Form.Group controlId="faq-answer">
            <Form.Label>{m.admin_faq_answer_label()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              value={form.answer}
              onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="warning"
            onClick={handleSave}
            disabled={
              createMutation.isPending ||
              updateMutation.isPending ||
              !form.question.trim() ||
              !form.answer.trim()
            }
          >
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

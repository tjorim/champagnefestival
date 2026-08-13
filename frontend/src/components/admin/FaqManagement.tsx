/**
 * FaqManagement — CRUD for the public FAQ section's question/answer pairs.
 *
 * Self-contained (own query + mutations, like AuditLogViewer/EditionsSection)
 * rather than wired through the central useAdminQueries/useAdminVenueActions
 * stack, since it's a single flat resource with no cross-entity dependencies.
 *
 * Each item carries three locales: Dutch is required (the primary content),
 * English/French are optional per item — leaving a language's fields empty
 * hides that item from that locale's public FAQ rather than falling back to
 * Dutch text.
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

interface FaqFormState {
  questionNl: string;
  answerNl: string;
  questionEn: string;
  answerEn: string;
  questionFr: string;
  answerFr: string;
}

const emptyForm: FaqFormState = {
  questionNl: "",
  answerNl: "",
  questionEn: "",
  answerEn: "",
  questionFr: "",
  answerFr: "",
};

interface FaqLocaleData {
  question: string;
  answer: string;
}

function faqPayload(data: FaqLocaleData & Omit<FaqFormState, "questionNl" | "answerNl">) {
  return {
    question_nl: data.question,
    answer_nl: data.answer,
    question_en: data.questionEn,
    answer_en: data.answerEn,
    question_fr: data.questionFr,
    answer_fr: data.answerFr,
  };
}

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
  const [form, setForm] = useState<FaqFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: FaqLocaleData & Omit<FaqFormState, "questionNl" | "answerNl">) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/faq",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(faqPayload(data)),
        },
        m.admin_error_add_faq_item(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [faqItemsQueryKey, ["faq"]]),
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
            ...(data.questionNl !== undefined && { question_nl: data.questionNl }),
            ...(data.answerNl !== undefined && { answer_nl: data.answerNl }),
            ...(data.questionEn !== undefined && { question_en: data.questionEn ?? "" }),
            ...(data.answerEn !== undefined && { answer_en: data.answerEn ?? "" }),
            ...(data.questionFr !== undefined && { question_fr: data.questionFr ?? "" }),
            ...(data.answerFr !== undefined && { answer_fr: data.answerFr ?? "" }),
            ...(data.active !== undefined && { active: data.active }),
          }),
        },
        m.admin_error_update_faq_item(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [faqItemsQueryKey, ["faq"]]),
    retry: false,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/faq/reorder",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ ordered_ids: orderedIds }),
        },
        m.admin_error_reorder_faq_items(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [faqItemsQueryKey, ["faq"]]),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/faq/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_faq_item(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [faqItemsQueryKey, ["faq"]]),
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
    setForm({
      questionNl: item.questionNl,
      answerNl: item.answerNl,
      questionEn: item.questionEn ?? "",
      answerEn: item.answerEn ?? "",
      questionFr: item.questionFr ?? "",
      answerFr: item.answerFr ?? "",
    });
    setError(null);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.questionNl.trim()) {
      setError(m.admin_faq_question_required());
      return;
    }
    if (!form.answerNl.trim()) {
      setError(m.admin_faq_answer_required());
      return;
    }
    setError(null);
    const locales = {
      questionEn: form.questionEn.trim(),
      answerEn: form.answerEn.trim(),
      questionFr: form.questionFr.trim(),
      answerFr: form.answerFr.trim(),
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          data: {
            questionNl: form.questionNl.trim(),
            answerNl: form.answerNl.trim(),
            questionEn: locales.questionEn,
            answerEn: locales.answerEn,
            questionFr: locales.questionFr,
            answerFr: locales.answerFr,
          },
        });
      } else {
        await createMutation.mutateAsync({
          question: form.questionNl.trim(),
          answer: form.answerNl.trim(),
          ...locales,
        });
      }
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [form, editingId, createMutation, updateMutation]);

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
      if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) return;
      const reordered = sorted.map((entry, i) => {
        if (i === index) return sorted[swapIndex]!;
        if (i === swapIndex) return sorted[index]!;
        return entry;
      });
      setRowError(null);
      try {
        // One atomic call for the whole list rather than two independent
        // per-item writes — the backend rejects a stale/partial list outright
        // instead of risking an ambiguous half-applied order (#836).
        await reorderMutation.mutateAsync(reordered.map((i) => i.id));
      } catch (err) {
        setRowError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [faqItems, reorderMutation],
  );

  const sortedItems = useMemo(
    () => [...faqItems].sort((a, b) => a.sortOrder - b.sortOrder),
    [faqItems],
  );

  const isMutating = updateMutation.isPending || deleteMutation.isPending || reorderMutation.isPending;

  const localeBadge = (label: string, translated: boolean) => (
    <Badge
      key={label}
      bg={translated ? "success" : "secondary"}
      className={`ms-1 fs-2xs ${translated ? "" : "opacity-50"}`}
      title={translated ? undefined : m.admin_faq_locale_missing_title({ locale: label })}
    >
      {label}
    </Badge>
  );

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
                          {item.questionNl}
                          {!item.active && (
                            <Badge bg="secondary" className="ms-2 fs-2xs">
                              {m.admin_venue_archived_badge()}
                            </Badge>
                          )}
                          {localeBadge("EN", Boolean(item.questionEn && item.answerEn))}
                          {localeBadge("FR", Boolean(item.questionFr && item.answerFr))}
                        </div>
                        <div className="text-secondary small">{item.answerNl}</div>
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

      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title>{editingId ? m.admin_edit_faq_item() : m.admin_add_faq_item()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {error && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {error}
            </Alert>
          )}

          <div className="mb-4">
            <div className="text-warning small fw-semibold mb-2">
              {m.admin_faq_locale_nl_label()}
            </div>
            <Form.Group className="mb-3" controlId="faq-question-nl">
              <Form.Label>{m.admin_faq_question_label()}</Form.Label>
              <Form.Control
                type="text"
                value={form.questionNl}
                onChange={(e) => setForm((p) => ({ ...p, questionNl: e.target.value }))}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
            <Form.Group controlId="faq-answer-nl">
              <Form.Label>{m.admin_faq_answer_label()}</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={form.answerNl}
                onChange={(e) => setForm((p) => ({ ...p, answerNl: e.target.value }))}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
          </div>

          <div className="mb-4">
            <div className="text-secondary small fw-semibold mb-1">
              {m.admin_faq_locale_en_label()}
            </div>
            <div className="text-secondary small mb-2">{m.admin_faq_locale_optional_hint()}</div>
            <Form.Group className="mb-3" controlId="faq-question-en">
              <Form.Label>{m.admin_faq_question_label()}</Form.Label>
              <Form.Control
                type="text"
                value={form.questionEn}
                onChange={(e) => setForm((p) => ({ ...p, questionEn: e.target.value }))}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
            <Form.Group controlId="faq-answer-en">
              <Form.Label>{m.admin_faq_answer_label()}</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={form.answerEn}
                onChange={(e) => setForm((p) => ({ ...p, answerEn: e.target.value }))}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
          </div>

          <div>
            <div className="text-secondary small fw-semibold mb-1">
              {m.admin_faq_locale_fr_label()}
            </div>
            <div className="text-secondary small mb-2">{m.admin_faq_locale_optional_hint()}</div>
            <Form.Group className="mb-3" controlId="faq-question-fr">
              <Form.Label>{m.admin_faq_question_label()}</Form.Label>
              <Form.Control
                type="text"
                value={form.questionFr}
                onChange={(e) => setForm((p) => ({ ...p, questionFr: e.target.value }))}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
            <Form.Group controlId="faq-answer-fr">
              <Form.Label>{m.admin_faq_answer_label()}</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={form.answerFr}
                onChange={(e) => setForm((p) => ({ ...p, answerFr: e.target.value }))}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
          </div>
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
              !form.questionNl.trim() ||
              !form.answerNl.trim()
            }
          >
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

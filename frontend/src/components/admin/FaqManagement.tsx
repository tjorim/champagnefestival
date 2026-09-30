import { AdminField, AdminLabel, AdminInput, AdminTextarea } from "@/components/admin/AdminFields";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import Spinner from "react-bootstrap/Spinner";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { m } from "@/paraglide/messages";
import type { FaqItem } from "@/types/admin";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { fetchFaqItemsAdmin } from "@/utils/adminFetch";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { invalidateAdmin } from "@/utils/queryInvalidation";
import { useAppTable, createAppColumnHelper } from "@/hooks/useAdminTable";

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

const columnHelper = createAppColumnHelper<FaqItem>();

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
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });

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
      const confirmed = await confirm({
        title: m.admin_faq_delete_title(),
        body: m.admin_faq_delete_confirm(),
        errorFallback: m.admin_error_delete_faq_item(),
      });
      if (!confirmed) return;
      setRowError(null);
      try {
        await deleteMutation.mutateAsync(item.id);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [confirm, deleteMutation],
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

  const isMutating =
    updateMutation.isPending || deleteMutation.isPending || reorderMutation.isPending;

  const localeBadge = (label: string, translated: boolean) => (
    <Badge
      key={label}
      bg={translated ? "success" : "secondary"}
      className={`tw:ms-1 tw:text-tiny ${translated ? "" : "opacity-50"}`}
      title={translated ? undefined : m.admin_faq_locale_missing_title({ locale: label })}
    >
      {label}
    </Badge>
  );

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "reorder",
          header: "",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="tw:flex tw:flex-col">
              <Button
                size="sm"
                variant="link"
                className="tw:p-0 tw:text-content"
                disabled={row.index === 0 || isMutating}
                onClick={() => handleMove(row.original, "up")}
                aria-label={m.admin_faq_move_up()}
                title={m.admin_faq_move_up()}
              >
                <Icon icon={ChevronUpIcon} />
              </Button>
              <Button
                size="sm"
                variant="link"
                className="tw:p-0 tw:text-content"
                disabled={row.index === sortedItems.length - 1 || isMutating}
                onClick={() => handleMove(row.original, "down")}
                aria-label={m.admin_faq_move_down()}
                title={m.admin_faq_move_down()}
              >
                <Icon icon={ChevronDownIcon} />
              </Button>
            </div>
          ),
        }),
        columnHelper.display({
          id: "content",
          header: "",
          enableSorting: false,
          cell: ({ row }) => {
            const item = row.original;
            return (
              <>
                <div className="tw:font-semibold">
                  {item.questionNl}
                  {!item.active && (
                    <Badge bg="secondary" className="tw:ms-2 tw:text-tiny">
                      {m.admin_venue_archived_badge()}
                    </Badge>
                  )}
                  {localeBadge("EN", Boolean(item.questionEn && item.answerEn))}
                  {localeBadge("FR", Boolean(item.questionFr && item.answerFr))}
                </div>
                <div className="tw:text-subtle tw:text-sm">{item.answerNl}</div>
              </>
            );
          },
        }),
        columnHelper.display({
          id: "actions",
          header: "",
          enableSorting: false,
          cell: ({ row }) => {
            const item = row.original;
            return (
              <div className="tw:flex tw:gap-1">
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={isMutating}
                  onClick={() => openEdit(item)}
                  aria-label={m.admin_edit()}
                  title={m.admin_edit()}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={isMutating}
                  onClick={() => handleToggleActive(item)}
                  aria-label={item.active ? m.admin_content_archive() : m.admin_content_restore()}
                  title={item.active ? m.admin_content_archive() : m.admin_content_restore()}
                >
                  <Icon icon={item.active ? EyeOffIcon : EyeIcon} />
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  disabled={isMutating}
                  onClick={() => handleDelete(item)}
                  aria-label={m.admin_delete()}
                  title={m.admin_delete()}
                >
                  <Icon icon={TrashIcon} />
                </Button>
              </div>
            );
          },
        }),
      ]),
    [sortedItems.length, isMutating, handleMove, openEdit, handleToggleActive, handleDelete],
  );

  const table = useAppTable({ data: sortedItems, columns, getRowId: (row) => row.id }, () => ({}));

  return (
    <>
      <Card tone="secondary">
        <CardHeader className="tw:flex tw:items-center tw:justify-between">
          <span className="tw:font-semibold">{m.admin_content_faq_section()}</span>
          <Button variant="outline-warning" size="sm" onClick={openAdd}>
            <Icon icon={PlusIcon} className="tw:me-1" />
            {m.admin_add_faq_item()}
          </Button>
        </CardHeader>
        <CardContent className="tw:p-0">
          {rowError && (
            <Alert variant="danger" className="tw:m-4 tw:py-1 tw:text-sm">
              {rowError}
            </Alert>
          )}
          {faqItemsQuery.isError ? (
            <Alert variant="danger" className="tw:m-4 tw:py-1 tw:text-sm">
              {m.admin_error_load_data()}
            </Alert>
          ) : faqItemsQuery.isPending ? (
            <div className="tw:text-center tw:py-12">
              <Spinner animation="border" size="sm" role="status">
                <span className="tw:sr-only">{m.admin_loading()}</span>
              </Spinner>
            </div>
          ) : sortedItems.length === 0 ? (
            <p className="tw:text-subtle tw:text-center tw:py-6 tw:mb-0">
              {m.admin_no_faq_items()}
            </p>
          ) : (
            <div data-tailwind-migrated="true" className="tw:w-full">
              <Table>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={!row.original.active ? "tw:opacity-50" : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={
                            cell.column.id === "reorder" || cell.column.id === "actions"
                              ? "tw:w-px tw:whitespace-nowrap"
                              : undefined
                          }
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          if (!open) setShowModal(false);
        }}
      >
        <DialogContent admin size="lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? m.admin_edit_faq_item() : m.admin_add_faq_item()}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {error && (
              <Alert variant="danger" className="tw:py-1 tw:mb-4 tw:text-sm">
                {error}
              </Alert>
            )}

            <div className="tw:mb-6">
              <div className="tw:text-highlight tw:text-sm tw:font-semibold tw:mb-2">
                {m.admin_faq_locale_nl_label()}
              </div>
              <AdminField className="tw:mb-4" controlId="faq-question-nl">
                <AdminLabel>{m.admin_faq_question_label()}</AdminLabel>
                <AdminInput
                  type="text"
                  value={form.questionNl}
                  onChange={(e) => setForm((p) => ({ ...p, questionNl: e.target.value }))}
                  className="tw:bg-muted tw:text-content tw:border-input"
                />
              </AdminField>
              <AdminField controlId="faq-answer-nl">
                <AdminLabel>{m.admin_faq_answer_label()}</AdminLabel>
                <AdminTextarea
                  rows={3}
                  value={form.answerNl}
                  onChange={(e) => setForm((p) => ({ ...p, answerNl: e.target.value }))}
                  className="tw:bg-muted tw:text-content tw:border-input"
                />
              </AdminField>
            </div>

            <div className="tw:mb-6">
              <div className="tw:text-subtle tw:text-sm tw:font-semibold tw:mb-1">
                {m.admin_faq_locale_en_label()}
              </div>
              <div className="tw:text-subtle tw:text-sm tw:mb-2">
                {m.admin_faq_locale_optional_hint()}
              </div>
              <AdminField className="tw:mb-4" controlId="faq-question-en">
                <AdminLabel>{m.admin_faq_question_label()}</AdminLabel>
                <AdminInput
                  type="text"
                  value={form.questionEn}
                  onChange={(e) => setForm((p) => ({ ...p, questionEn: e.target.value }))}
                  className="tw:bg-muted tw:text-content tw:border-input"
                />
              </AdminField>
              <AdminField controlId="faq-answer-en">
                <AdminLabel>{m.admin_faq_answer_label()}</AdminLabel>
                <AdminTextarea
                  rows={3}
                  value={form.answerEn}
                  onChange={(e) => setForm((p) => ({ ...p, answerEn: e.target.value }))}
                  className="tw:bg-muted tw:text-content tw:border-input"
                />
              </AdminField>
            </div>

            <div>
              <div className="tw:text-subtle tw:text-sm tw:font-semibold tw:mb-1">
                {m.admin_faq_locale_fr_label()}
              </div>
              <div className="tw:text-subtle tw:text-sm tw:mb-2">
                {m.admin_faq_locale_optional_hint()}
              </div>
              <AdminField className="tw:mb-4" controlId="faq-question-fr">
                <AdminLabel>{m.admin_faq_question_label()}</AdminLabel>
                <AdminInput
                  type="text"
                  value={form.questionFr}
                  onChange={(e) => setForm((p) => ({ ...p, questionFr: e.target.value }))}
                  className="tw:bg-muted tw:text-content tw:border-input"
                />
              </AdminField>
              <AdminField controlId="faq-answer-fr">
                <AdminLabel>{m.admin_faq_answer_label()}</AdminLabel>
                <AdminTextarea
                  rows={3}
                  value={form.answerFr}
                  onChange={(e) => setForm((p) => ({ ...p, answerFr: e.target.value }))}
                  className="tw:bg-muted tw:text-content tw:border-input"
                />
              </AdminField>
            </div>
          </DialogBody>
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}

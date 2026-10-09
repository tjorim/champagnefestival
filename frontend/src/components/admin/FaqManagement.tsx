import { Button } from "@/components/ui/button";
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
import {
  EMPTY_LOCALIZED_TEXT,
  LocalizedInputs,
  OriginalLanguageSelect,
  hasOriginal,
  type Language,
  type LocalizedText,
} from "@/components/admin/LocalizedFields";
/**
 * FaqManagement — CRUD for the public FAQ section's question/answer pairs.
 *
 * Self-contained (own query + mutations, like AuditLogViewer/EditionsSection)
 * rather than wired through the central useAdminQueries/useAdminVenueActions
 * stack, since it's a single flat resource with no cross-entity dependencies.
 *
 * Each item has an original language whose question and answer are required;
 * the other languages are optional translations. A language is shown to visitors
 * only when both its question and answer are filled, otherwise they see the
 * original (same rule as event titles).
 */

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
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
  textLanguage: Language;
  question: LocalizedText;
  answer: LocalizedText;
}

const emptyForm: FaqFormState = {
  textLanguage: "nl",
  question: EMPTY_LOCALIZED_TEXT,
  answer: EMPTY_LOCALIZED_TEXT,
};

const columnHelper = createAppColumnHelper<FaqItem>();

/** Blank translations are sent as `null`, which clears them on update. */
function faqPayload(form: FaqFormState) {
  const text = (value: string) => value.trim() || null;
  return {
    text_language: form.textLanguage,
    question_nl: text(form.question.nl),
    question_fr: text(form.question.fr),
    question_en: text(form.question.en),
    answer_nl: text(form.answer.nl),
    answer_fr: text(form.answer.fr),
    answer_en: text(form.answer.en),
  };
}

function toForm(item: FaqItem): FaqFormState {
  return {
    textLanguage: item.textLanguage,
    question: { nl: item.questionNl ?? "", fr: item.questionFr ?? "", en: item.questionEn ?? "" },
    answer: { nl: item.answerNl ?? "", fr: item.answerFr ?? "", en: item.answerEn ?? "" },
  };
}

/** The item's text in its original language, for the list. */
function originalText(item: FaqItem) {
  const byLanguage = {
    nl: [item.questionNl, item.answerNl],
    fr: [item.questionFr, item.answerFr],
    en: [item.questionEn, item.answerEn],
  } as const;
  const [question, answer] = byLanguage[item.textLanguage];
  return { question: question ?? "", answer: answer ?? "" };
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

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string | null; data: Record<string, unknown> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        id ? `/api/faq/${id}` : "/api/faq",
        {
          method: id ? "PUT" : "POST",
          headers: authHeaders(),
          body: JSON.stringify(data),
        },
        id ? m.admin_error_update_faq_item() : m.admin_error_add_faq_item(),
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
    setForm(toForm(item));
    setError(null);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!hasOriginal(form.textLanguage, form.question)) {
      setError(m.admin_faq_question_required());
      return;
    }
    if (!hasOriginal(form.textLanguage, form.answer)) {
      setError(m.admin_faq_answer_required());
      return;
    }
    setError(null);
    try {
      await saveMutation.mutateAsync({ id: editingId, data: faqPayload(form) });
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }, [form, editingId, saveMutation]);

  const handleToggleActive = useCallback(
    async (item: FaqItem) => {
      setRowError(null);
      try {
        await saveMutation.mutateAsync({ id: item.id, data: { active: !item.active } });
      } catch (err) {
        setRowError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [saveMutation],
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
    saveMutation.isPending || deleteMutation.isPending || reorderMutation.isPending;

  const languageBadge = (label: string, translated: boolean) => (
    <Badge
      key={label}
      variant={translated ? "success" : "secondary"}
      className={`ms-1 text-tiny ${translated ? "" : "opacity-50"}`}
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
            <div className="flex flex-col">
              <Button
                size="sm"
                variant="link"
                className="p-0 text-content"
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
                className="p-0 text-content"
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
            const original = originalText(item);
            return (
              <>
                <div className="font-semibold">
                  {original.question}
                  {!item.active && (
                    <Badge variant="secondary" className="ms-2 text-tiny">
                      {m.admin_venue_archived_badge()}
                    </Badge>
                  )}
                  {languageBadge("NL", Boolean(item.questionNl && item.answerNl))}
                  {languageBadge("FR", Boolean(item.questionFr && item.answerFr))}
                  {languageBadge("EN", Boolean(item.questionEn && item.answerEn))}
                </div>
                <div className="text-subtle text-sm">{original.answer}</div>
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
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isMutating}
                  onClick={() => openEdit(item)}
                  aria-label={m.admin_edit()}
                  title={m.admin_edit()}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
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
        <CardHeader className="flex items-center justify-between">
          <span className="font-semibold">{m.admin_content_faq_section()}</span>
          <Button variant="outline-warning" size="sm" onClick={openAdd}>
            <Icon icon={PlusIcon} />
            {m.admin_add_faq_item()}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rowError && (
            <Alert variant="danger" className="m-4 py-1 text-sm">
              {rowError}
            </Alert>
          )}
          {faqItemsQuery.isError ? (
            <Alert variant="danger" className="m-4 py-1 text-sm">
              {m.admin_error_load_data()}
            </Alert>
          ) : faqItemsQuery.isPending ? (
            <div className="text-center py-12">
              <Spinner size="sm" role="status">
                <span className="sr-only">{m.admin_loading()}</span>
              </Spinner>
            </div>
          ) : sortedItems.length === 0 ? (
            <p className="text-subtle text-center py-6 mb-0">{m.admin_no_faq_items()}</p>
          ) : (
            <div className="w-full">
              <Table>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={!row.original.active ? "opacity-50" : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={
                            cell.column.id === "reorder" || cell.column.id === "actions"
                              ? "w-px whitespace-nowrap"
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
              <Alert variant="danger" className="py-1 mb-4 text-sm">
                {error}
              </Alert>
            )}

            <OriginalLanguageSelect
              controlId="faq-text-language"
              label={m.admin_faq_original_language()}
              value={form.textLanguage}
              onChange={(textLanguage) => setForm((previous) => ({ ...previous, textLanguage }))}
            />
            <p className="text-sm text-subtle mb-4">{m.admin_faq_text_help()}</p>
            <LocalizedInputs
              idPrefix="faq-question"
              label={(language) => m.admin_faq_question_label_in({ language })}
              values={form.question}
              maxLength={500}
              onChange={(language, text) =>
                setForm((previous) => ({
                  ...previous,
                  question: { ...previous.question, [language]: text },
                }))
              }
            />
            <LocalizedInputs
              idPrefix="faq-answer"
              label={(language) => m.admin_faq_answer_label_in({ language })}
              values={form.answer}
              multiline
              maxLength={10000}
              onChange={(language, text) =>
                setForm((previous) => ({
                  ...previous,
                  answer: { ...previous.answer, [language]: text },
                }))
              }
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {m.admin_action_cancel()}
            </Button>
            <Button variant="warning" onClick={handleSave} disabled={saveMutation.isPending}>
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}

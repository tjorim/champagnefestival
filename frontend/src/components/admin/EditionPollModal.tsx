import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminEmptyState } from "./AdminEmptyState";
import { AdminField, AdminLabel, AdminOption, AdminSelect } from "@/components/admin/AdminFields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
  copyPollQuestions,
  createPollQuestion,
  deletePollQuestion,
  fetchEditions,
  fetchPollOrders,
  fetchPollQuestions,
  reorderPollQuestions,
  type PollQuestion,
  type PollQuestionWrite,
} from "@/utils/adminContentApi";
import { apiErrorMessage } from "@/utils/apiErrors";
import { pollKindLabel, POLL_QUESTION_KINDS, type PollQuestionKind } from "@/utils/pollKinds";
import { queryKeys } from "@/utils/queryKeys";
import PollOrdersTable from "./PollOrdersTable";
import PollQuestionCard, { QuestionTextFields } from "./PollQuestionCard";
import VolunteerPollOrderDialog from "./VolunteerPollOrderDialog";
import type { Edition } from "./editionTypes";

interface EditionPollModalProps {
  show: boolean;
  edition: Edition | null;
  authHeaders: () => Record<string, string>;
  onHide: () => void;
}

const EMPTY_QUESTION: PollQuestionWrite = {
  titleNl: "",
  titleFr: "",
  titleEn: "",
  descriptionNl: "",
  descriptionFr: "",
  descriptionEn: "",
};

/** The volunteer poll of an edition: its questions (yes/no or meals), who answered what, and entering answers. */
export default function EditionPollModal({
  show,
  edition,
  authHeaders,
  onHide,
}: EditionPollModalProps) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<PollQuestionKind>("yes_no");
  const [draft, setDraft] = useState<PollQuestionWrite>(EMPTY_QUESTION);
  const [copySource, setCopySource] = useState("");
  const [orderEditorId, setOrderEditorId] = useState<string | null>(null);

  const editionId = edition?.id ?? "";
  const enabled = show && Boolean(editionId);
  const questionsKey = queryKeys.admin.editionPollQuestions(editionId);
  const ordersKey = queryKeys.admin.editionPollOrders(editionId);

  const questionsQuery = useQuery({
    queryKey: questionsKey,
    queryFn: () => fetchPollQuestions(editionId, authHeaders),
    enabled,
    staleTime: 0,
  });
  const ordersQuery = useQuery({
    queryKey: ordersKey,
    queryFn: () => fetchPollOrders(editionId, getLocale(), authHeaders),
    enabled,
    staleTime: 0,
  });
  const editionsQuery = useQuery({
    queryKey: queryKeys.admin.contentManagement.editions,
    queryFn: () => fetchEditions(authHeaders),
    enabled,
  });

  const questions = questionsQuery.data ?? [];
  const orders = ordersQuery.data;
  const otherEditions = (editionsQuery.data ?? []).filter((other) => other.id !== editionId);
  const refreshOrders = () => void queryClient.invalidateQueries({ queryKey: ordersKey });
  const replaceQuestions = (next: PollQuestion[]) =>
    queryClient.setQueryData<PollQuestion[]>(questionsKey, next);

  async function run(operation: () => Promise<unknown>) {
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (err) {
      setError(apiErrorMessage(err, m.admin_content_error_save()));
    }
  }

  const createMutation = useMutation({
    mutationFn: () => createPollQuestion({ editionId, kind, ...draft }, authHeaders),
    retry: false,
    onSuccess: (created) => {
      replaceQuestions([...questions, created]);
      setDraft(EMPTY_QUESTION);
      refreshOrders();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: ({ question, notify }: { question: PollQuestion; notify: boolean }) =>
      deletePollQuestion(question.id, authHeaders, question.answeredCount > 0, notify),
    retry: false,
  });
  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderPollQuestions(editionId, orderedIds, authHeaders),
    retry: false,
    onSuccess: (reordered) => {
      replaceQuestions(reordered);
      refreshOrders();
    },
  });
  const copyMutation = useMutation({
    mutationFn: (fromEditionId: string) => copyPollQuestions(fromEditionId, editionId, authHeaders),
    retry: false,
    onSuccess: (created) => {
      replaceQuestions([...questions, ...created]);
      setNotice(
        created.length
          ? m.admin_poll_copied({ count: created.length })
          : m.admin_poll_copy_nothing(),
      );
      refreshOrders();
    },
  });

  function handleAdd() {
    if (!draft.titleNl.trim()) {
      setError(m.admin_poll_question_title_required());
      return;
    }
    void run(() => createMutation.mutateAsync());
  }

  async function handleDelete(question: PollQuestion) {
    let notify = true;
    const confirmed = await confirm({
      title: m.admin_poll_question_delete_title(),
      body: (
        <>
          <p>
            {question.answeredCount > 0
              ? m.admin_poll_question_delete_body_in_use({
                  title: question.title,
                  answered: question.answeredCount,
                })
              : m.admin_poll_question_delete_body({ title: question.title })}
          </p>
          {question.answeredCount > 0 && (
            <label className="mt-3 flex items-center gap-2">
              <Checkbox
                defaultChecked
                onCheckedChange={(checked) => {
                  notify = checked;
                }}
              />
              {m.admin_poll_notify_removed({ count: question.answeredCount })}
            </label>
          )}
        </>
      ),
      errorFallback: m.admin_content_error_save(),
      variant: "danger",
    });
    if (!confirmed) return;
    await run(async () => {
      await deleteMutation.mutateAsync({ question, notify });
      replaceQuestions(questions.filter((q) => q.id !== question.id));
      refreshOrders();
    });
  }

  function handleMove(index: number, direction: -1 | 1) {
    const ids = questions.map((q) => q.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(() => reorderMutation.mutateAsync(ids));
  }

  const busy = createMutation.isPending || deleteMutation.isPending || reorderMutation.isPending;
  const editor =
    orders && orderEditorId ? orders.volunteers.find((v) => v.volunteerId === orderEditorId) : null;

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>{m.admin_poll_modal_title({ edition: edition?.id ?? "" })}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-subtle">{m.admin_poll_modal_description()}</p>
          {error && <Alert variant="danger">{error}</Alert>}
          {notice && <Alert variant="success">{notice}</Alert>}

          {questionsQuery.isPending ? (
            <div className="flex justify-center py-4">
              <Spinner label={m.admin_loading()} size="sm" />
            </div>
          ) : questionsQuery.isError ? (
            <Alert variant="danger">{m.admin_content_error_load()}</Alert>
          ) : questions.length === 0 ? (
            <AdminEmptyState>{m.admin_poll_questions_empty()}</AdminEmptyState>
          ) : (
            questions.map((question, index) => (
              <PollQuestionCard
                key={question.id}
                question={question}
                index={index}
                count={questions.length}
                busy={busy}
                authHeaders={authHeaders}
                onChange={(updated) => {
                  replaceQuestions(questions.map((q) => (q.id === updated.id ? updated : q)));
                  refreshOrders();
                }}
                onMove={(direction) => handleMove(index, direction)}
                onDelete={() => void handleDelete(question)}
              />
            ))
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleAdd();
            }}
            className="flex flex-col gap-2 border-t border-input pt-4"
          >
            <h3 className="text-base font-medium leading-tight">{m.admin_poll_question_add()}</h3>
            <AdminField controlId="poll-question-kind" className="max-w-80">
              <AdminLabel className="text-sm text-subtle mb-1">
                {m.admin_poll_question_kind_label()}
              </AdminLabel>
              <AdminSelect
                size="sm"
                className="bg-muted text-content border-input"
                value={kind}
                onValueChange={(value) => setKind(value as PollQuestionKind)}
              >
                {POLL_QUESTION_KINDS.map((option) => (
                  <AdminOption key={option} value={option}>
                    {pollKindLabel(option)}
                  </AdminOption>
                ))}
              </AdminSelect>
            </AdminField>
            <QuestionTextFields idPrefix="poll-question-add" value={draft} onChange={setDraft} />
            <div>
              <Button
                type="submit"
                size="sm"
                variant="outline-primary"
                disabled={createMutation.isPending}
              >
                {m.admin_poll_question_add_button()}
              </Button>
            </div>
          </form>

          <section
            className="border-t border-input pt-4 mt-4"
            aria-label={m.admin_poll_copy_heading()}
          >
            <h3 className="text-base font-medium leading-tight">{m.admin_poll_copy_heading()}</h3>
            {otherEditions.length === 0 ? (
              <p className="text-sm text-subtle">{m.admin_poll_copy_no_editions()}</p>
            ) : (
              <div className="flex gap-2 items-end flex-wrap">
                <AdminField controlId="poll-copy-source" className="grow basis-60">
                  <AdminLabel className="text-sm text-subtle mb-1">
                    {m.admin_poll_copy_source_label()}
                  </AdminLabel>
                  <AdminSelect
                    size="sm"
                    className="bg-muted text-content border-input"
                    value={copySource}
                    onValueChange={(value) => setCopySource(value)}
                  >
                    {otherEditions.map((other) => (
                      <AdminOption key={other.id} value={other.id}>
                        {other.id}
                      </AdminOption>
                    ))}
                  </AdminSelect>
                </AdminField>
                <Button
                  size="sm"
                  variant="outline-primary"
                  disabled={!copySource || copyMutation.isPending}
                  onClick={() => void run(() => copyMutation.mutateAsync(copySource))}
                >
                  {m.admin_poll_copy_button()}
                </Button>
              </div>
            )}
          </section>

          <section
            className="border-t border-input pt-4 mt-4"
            aria-label={m.admin_poll_orders_heading()}
          >
            <h3 className="text-base font-medium leading-tight">{m.admin_poll_orders_heading()}</h3>
            {ordersQuery.isPending ? (
              <Spinner label={m.admin_loading()} size="sm" />
            ) : !orders ? (
              <Alert variant="danger">{m.admin_content_error_load()}</Alert>
            ) : (
              <PollOrdersTable editionId={editionId} orders={orders} onEdit={setOrderEditorId} />
            )}
          </section>
        </DialogBody>
        {orders && editor && (
          <VolunteerPollOrderDialog
            key={editor.volunteerId}
            editionId={editionId}
            volunteer={editor}
            questions={orders.questions}
            authHeaders={authHeaders}
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: questionsKey });
              refreshOrders();
            }}
            onHide={() => setOrderEditorId(null)}
          />
        )}
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AdminField, AdminLabel, AdminTextarea } from "@/components/admin/AdminFields";
import {
  ANSWER_FIELDS,
  type AnswerDraft,
  type AnswerPayload,
} from "@/components/admin/pollAnswerFields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { m } from "@/paraglide/messages";
import { setVolunteerPollOrder, type PollOrders } from "@/utils/adminContentApi";
import { apiErrorMessage } from "@/utils/apiErrors";

interface VolunteerPollOrderDialogProps {
  editionId: string;
  volunteer: PollOrders["volunteers"][number];
  questions: PollOrders["questions"];
  authHeaders: () => Record<string, string>;
  onSaved: () => void;
  onHide: () => void;
}

/** An admin entering or correcting one volunteer's answers, for example from an email. */
export default function VolunteerPollOrderDialog({
  editionId,
  volunteer,
  questions,
  authHeaders,
  onSaved,
  onHide,
}: VolunteerPollOrderDialogProps) {
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>(() =>
    Object.fromEntries(
      questions.map((question) => [
        question.id,
        ANSWER_FIELDS[question.kind].initial(question, volunteer),
      ]),
    ),
  );
  const [note, setNote] = useState(volunteer.note ?? "");
  const [error, setError] = useState("");
  const anyClosed = questions.some((question) => question.closed);

  function answerPayload(): AnswerPayload {
    const payload: AnswerPayload = {
      quantities: {},
      attendance: {},
      choices: {},
      texts: {},
      ratings: {},
    };
    for (const question of questions) {
      ANSWER_FIELDS[question.kind].contribute(question, drafts[question.id], payload);
    }
    return payload;
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      setVolunteerPollOrder(
        editionId,
        volunteer.volunteerId,
        {
          ...answerPayload(),
          note,
          confirmClosed: anyClosed,
        },
        authHeaders,
      ),
    retry: false,
  });

  async function handleSave() {
    setError("");
    const confirmed = await confirm({
      title: m.admin_poll_order_confirm_title({ name: volunteer.name }),
      body: anyClosed
        ? m.admin_poll_order_confirm_body_closed({ name: volunteer.name })
        : m.admin_poll_order_confirm_body({ name: volunteer.name }),
      errorFallback: m.admin_content_error_save(),
      variant: anyClosed ? "danger" : "primary",
    });
    if (!confirmed) return;
    try {
      await saveMutation.mutateAsync();
      onSaved();
      onHide();
    } catch (err) {
      setError(apiErrorMessage(err, m.admin_content_error_save()));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent admin>
        <DialogHeader>
          <DialogTitle>{m.admin_poll_order_edit_title({ name: volunteer.name })}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-subtle">
            {m.admin_poll_order_edit_help({ name: volunteer.name })}
          </p>
          {anyClosed && <Alert variant="warning">{m.admin_poll_order_closed_warning()}</Alert>}
          {error && <Alert variant="danger">{error}</Alert>}
          {questions.map((question) => {
            const { Fields } = ANSWER_FIELDS[question.kind];
            return (
              <fieldset key={question.id} className="border-0 p-0 m-0 mb-4">
                <legend className="text-base font-medium leading-tight mb-2">
                  {question.title}
                </legend>
                <Fields
                  question={question}
                  draft={drafts[question.id]}
                  onChange={(draft) =>
                    setDrafts((previous) => ({ ...previous, [question.id]: draft }))
                  }
                />
              </fieldset>
            );
          })}
          <AdminField controlId="poll-order-note" className="mb-2">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_poll_orders_note()}
            </AdminLabel>
            <AdminTextarea
              size="sm"
              rows={2}
              maxLength={500}
              className="bg-muted text-content border-input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </AdminField>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onHide}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="outline-primary"
            disabled={saveMutation.isPending}
            onClick={() => void handleSave()}
          >
            {m.admin_poll_order_save()}
          </Button>
        </DialogFooter>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}

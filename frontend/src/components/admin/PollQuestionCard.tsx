import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { AdminField, AdminInput, AdminLabel } from "@/components/admin/AdminFields";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
  setPollQuestionClosing,
  updatePollQuestion,
  type PollOption,
  type PollQuestion,
  type PollQuestionWrite,
} from "@/utils/adminContentApi";
import { apiErrorMessage } from "@/utils/apiErrors";
import { pollCountsSummary, pollKindLabel, POLL_KIND_HAS_OPTIONS } from "@/utils/pollKinds";
import { iso, localDate } from "./AnnouncementManagement";
import PollOptionsEditor from "./PollOptionsEditor";

const TEXT_FIELDS = [
  { language: m.admin_language_nl, title: "titleNl", description: "descriptionNl" },
  { language: m.admin_language_fr, title: "titleFr", description: "descriptionFr" },
  { language: m.admin_language_en, title: "titleEn", description: "descriptionEn" },
] as const;

function toQuestionWrite(question: PollQuestion): PollQuestionWrite {
  return {
    titleNl: question.titleNl,
    titleFr: question.titleFr ?? "",
    titleEn: question.titleEn ?? "",
    descriptionNl: question.descriptionNl ?? "",
    descriptionFr: question.descriptionFr ?? "",
    descriptionEn: question.descriptionEn ?? "",
  };
}

/** The title and description inputs of a question, one pair per language (Dutch required). */
export function QuestionTextFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: PollQuestionWrite;
  onChange: (next: PollQuestionWrite) => void;
}) {
  return (
    <div className="grow flex flex-col gap-2">
      {TEXT_FIELDS.map(({ language, title, description }) => (
        <div key={title} className="flex gap-2 flex-wrap">
          <AdminField controlId={`${idPrefix}-${title}`} className="grow basis-60">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_poll_question_title_in({ language: language() })}
            </AdminLabel>
            <AdminInput
              size="sm"
              className="bg-muted text-content border-input"
              value={value[title]}
              maxLength={200}
              onChange={(event) => onChange({ ...value, [title]: event.target.value })}
            />
          </AdminField>
          <AdminField controlId={`${idPrefix}-${description}`} className="grow basis-60">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_poll_question_description_in({ language: language() })}
            </AdminLabel>
            <AdminInput
              size="sm"
              className="bg-muted text-content border-input"
              value={value[description]}
              maxLength={500}
              onChange={(event) => onChange({ ...value, [description]: event.target.value })}
            />
          </AdminField>
        </div>
      ))}
    </div>
  );
}

interface PollQuestionCardProps {
  question: PollQuestion;
  index: number;
  count: number;
  /** Another change is in flight (moving or deleting), so the controls wait. */
  busy: boolean;
  authHeaders: () => Record<string, string>;
  onChange: (question: PollQuestion) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/** One poll question: its texts, its own closing time and, for a meals question, its options. */
export default function PollQuestionCard({
  question,
  index,
  count,
  busy,
  authHeaders,
  onChange,
  onMove,
  onDelete,
}: PollQuestionCardProps) {
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PollQuestionWrite | null>(null);
  const [closingDraft, setClosingDraft] = useState<{ saved: string | null; value: string } | null>(
    null,
  );

  const textMutation = useMutation({
    mutationFn: (write: PollQuestionWrite) => updatePollQuestion(question.id, write, authHeaders),
    retry: false,
    onSuccess: (updated) => {
      onChange(updated);
      setEditing(null);
    },
  });
  const closingMutation = useMutation({
    mutationFn: (closesAt: string | null) =>
      setPollQuestionClosing(question.id, closesAt, authHeaders),
    retry: false,
    onSuccess: (updated) => {
      onChange(updated);
      setClosingDraft(null);
    },
  });

  async function run(operation: () => Promise<unknown>) {
    setError("");
    try {
      await operation();
    } catch (err) {
      setError(apiErrorMessage(err, m.admin_content_error_save()));
    }
  }

  function handleSaveTexts() {
    if (!editing) return;
    if (!editing.titleNl.trim()) {
      setError(m.admin_poll_question_title_required());
      return;
    }
    void run(() => textMutation.mutateAsync(editing));
  }

  const closesAtInput =
    closingDraft && closingDraft.saved === question.closesAt
      ? closingDraft.value
      : localDate(question.closesAt);
  const summary = pollCountsSummary(question.kind, question);
  const status = question.closed
    ? m.admin_poll_status_closed()
    : question.closesAt
      ? m.admin_poll_status_open_until({
          time: new Date(question.closesAt).toLocaleString(getLocale()),
        })
      : m.admin_poll_status_open();

  return (
    <section
      className="border border-input rounded-md p-4 mb-4"
      aria-label={question.title}
      data-poll-question={question.id}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col">
          <Button
            size="sm"
            variant="link"
            className="p-0 text-content"
            disabled={index === 0 || busy}
            onClick={() => onMove(-1)}
            aria-label={m.admin_poll_question_move_up({ title: question.title })}
            title={m.admin_poll_question_move_up({ title: question.title })}
          >
            <Icon icon={ChevronUpIcon} />
          </Button>
          <Button
            size="sm"
            variant="link"
            className="p-0 text-content"
            disabled={index === count - 1 || busy}
            onClick={() => onMove(1)}
            aria-label={m.admin_poll_question_move_down({ title: question.title })}
            title={m.admin_poll_question_move_down({ title: question.title })}
          >
            <Icon icon={ChevronDownIcon} />
          </Button>
        </div>
        <div className="grow">
          {editing ? (
            <QuestionTextFields
              idPrefix={`poll-question-${question.id}`}
              value={editing}
              onChange={setEditing}
            />
          ) : (
            <>
              <h3 className="text-base font-medium leading-tight mb-1">
                {question.title} <Badge variant="info">{pollKindLabel(question.kind)}</Badge>{" "}
                <Badge variant={question.closed ? "danger" : "success"}>{status}</Badge>
              </h3>
              {(question.titleFr || question.titleEn) && (
                <div className="text-sm text-subtle">
                  {[question.titleFr, question.titleEn].filter(Boolean).join(" · ")}
                </div>
              )}
              {question.descriptionNl && (
                <p className="text-sm text-subtle mb-0">{question.descriptionNl}</p>
              )}
            </>
          )}
        </div>
        {editing ? (
          <>
            <Button
              size="sm"
              variant="outline-primary"
              disabled={textMutation.isPending}
              onClick={handleSaveTexts}
            >
              {m.admin_save()}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
              {m.admin_action_cancel()}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(toQuestionWrite(question))}
            >
              {m.admin_edit()}
            </Button>
            <Button size="sm" variant="outline-danger" disabled={busy} onClick={onDelete}>
              {m.admin_delete()}
            </Button>
          </>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex gap-2 items-end flex-wrap my-3">
        <AdminField controlId={`poll-closes-at-${question.id}`} className="grow basis-60">
          <AdminLabel className="text-sm text-subtle mb-1">
            {m.admin_poll_closes_at_label()}
          </AdminLabel>
          <AdminInput
            type="datetime-local"
            size="sm"
            className="bg-muted text-content border-input"
            value={closesAtInput}
            onChange={(event) =>
              setClosingDraft({ saved: question.closesAt, value: event.target.value })
            }
          />
        </AdminField>
        <Button
          size="sm"
          variant="outline-primary"
          disabled={!closesAtInput || closingMutation.isPending}
          onClick={() => void run(() => closingMutation.mutateAsync(iso(closesAtInput)))}
        >
          {m.admin_poll_closing_save()}
        </Button>
        {question.closed || question.closesAt ? (
          <Button
            size="sm"
            variant="outline"
            disabled={closingMutation.isPending}
            onClick={() => void run(() => closingMutation.mutateAsync(null))}
          >
            {m.admin_poll_reopen()}
          </Button>
        ) : null}
        {!question.closed && (
          <Button
            size="sm"
            variant="outline-danger"
            disabled={closingMutation.isPending}
            onClick={() => void run(() => closingMutation.mutateAsync(new Date().toISOString()))}
          >
            {m.admin_poll_close_now()}
          </Button>
        )}
      </div>

      {summary && <p className="text-sm text-subtle mb-0">{summary}</p>}
      {POLL_KIND_HAS_OPTIONS[question.kind] && (
        <PollOptionsEditor
          question={question}
          authHeaders={authHeaders}
          onOptionsChange={(options: PollOption[]) => onChange({ ...question, options })}
        />
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ANSWER_INPUTS } from "@/components/MyPollAnswers";
import { PublicField, PublicLabel, PublicTextarea } from "@/components/PublicFields";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { apiErrorMessage } from "@/utils/apiErrors";
import {
  getMyPoll,
  saveMyPollNote,
  type MyPoll,
  type MyPollQuestion,
} from "@/utils/myVolunteerApi";
import { POLL_KIND_HAS_NOTE } from "@/utils/pollKinds";

function Closing({ question }: { question: MyPollQuestion }) {
  if (question.closed) {
    return (
      <p className="text-sm mb-2" role="status">
        {m.my_poll_closed()}
      </p>
    );
  }
  return question.closesAt ? (
    <p className="text-sm mb-2">
      {m.my_poll_closes_at({ time: new Date(question.closesAt).toLocaleString(getLocale()) })}
    </p>
  ) : null;
}

/** The volunteer's questions of the active edition: yes/no and choose-your-meals, each answered on its own. */
export default function MyPollSection({ getAccessToken }: { getAccessToken: () => string | null }) {
  const token = () => getAccessToken() ?? "";
  const [poll, setPoll] = useState<MyPoll | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ saved: string; text: string } | null>(null);
  const writeLock = useRef(false);
  const [saveTarget, setSaveTarget] = useState<string | null>(null);

  const loadMutation = useMutation({
    mutationFn: () => getMyPoll(token(), getLocale()),
    retry: false,
    onSuccess: setPoll,
  });
  const saveMutation = useMutation({
    mutationFn: (save: (accessToken: string, locale: string) => Promise<MyPoll>) =>
      save(token(), getLocale()),
    retry: false,
    onSuccess: setPoll,
    onSettled: () => {
      writeLock.current = false;
    },
  });
  const { mutate: load } = loadMutation;

  useEffect(() => {
    load();
  }, [load, getAccessToken]);

  // Loading, failed, no active edition and no questions look different, so a volunteer can tell a
  // temporary failure (retry) from there simply being nothing to answer.
  if (!poll) {
    return loadMutation.isError ? (
      <LoadErrorAlert onRetry={() => load()}>{m.my_poll_load_error()}</LoadErrorAlert>
    ) : (
      <div className="flex items-center justify-center gap-2 text-subtle mb-4">
        <Spinner label={m.loading()} size="sm" />
      </div>
    );
  }
  if (!poll.editionId || poll.questions.length === 0) {
    return (
      <Alert variant="secondary" role="status">
        {poll.editionId ? m.my_poll_empty() : m.my_poll_no_edition()}
      </Alert>
    );
  }

  const saving = saveMutation.isPending;
  const save = (
    target: string,
    action: (accessToken: string, locale: string) => Promise<MyPoll>,
  ) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setSaveTarget(target);

    saveMutation.mutate(action);
  };
  const noted = poll.questions.filter((question) => POLL_KIND_HAS_NOTE[question.kind]);
  const noteOpen = noted.some((question) => !question.closed);
  const savedNote = poll.note ?? "";
  const note = noteDraft && noteDraft.saved === savedNote ? noteDraft.text : savedNote;

  const feedback = (target: string) =>
    saveTarget === target && (
      <div className="mt-2" role={saveMutation.isError ? "alert" : "status"}>
        {saving ? (
          m.my_poll_pending()
        ) : saveMutation.isError ? (
          <>
            <p>{apiErrorMessage(saveMutation.error, m.my_poll_save_error())}</p>
            {target !== "note" &&
              poll.questions.find((q) => q.id === target)?.kind !== "free_text" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (saveMutation.variables) save(target, saveMutation.variables);
                  }}
                >
                  {m.my_poll_retry()}
                </Button>
              )}
          </>
        ) : target === "note" ? (
          m.my_poll_note_saved()
        ) : (
          m.my_poll_saved()
        )}
      </div>
    );

  return (
    <section className="mb-6" aria-label={m.my_poll_heading()}>
      <h3 className="text-base font-medium leading-tight">{m.my_poll_heading()}</h3>
      <p className="text-sm mb-4">{m.my_poll_description()}</p>
      {poll.questions.map((question) => {
        const AnswerInput = ANSWER_INPUTS[question.kind];
        return (
          <section
            key={question.id}
            className="mb-6 border-b border-border pb-4"
            aria-label={question.title}
          >
            <h4
              className="text-sm font-medium leading-tight mb-1"
              id={`my-poll-${question.id}-title`}
            >
              {question.title}
            </h4>
            {question.description && <p className="text-sm mb-2">{question.description}</p>}
            {question.eventId && (
              <p className="text-sm text-subtle mb-2">{m.volunteer_poll_event_notice()}</p>
            )}
            <Closing question={question} />
            <p className="text-sm mb-2">
              {question.kind === "free_text" ? m.my_poll_explicit() : m.my_poll_auto()}
            </p>
            <AnswerInput
              question={question}
              saving={saving}
              save={(action) => save(question.id, action)}
            />
            {feedback(question.id)}
          </section>
        );
      })}
      {noted.length > 0 && (
        <>
          <p className="text-sm mb-2">{noteOpen ? m.my_poll_explicit() : m.my_poll_closed()}</p>
          <PublicField className="mb-2" controlId="my-poll-note">
            <PublicLabel>{m.my_poll_note_label()}</PublicLabel>
            <PublicTextarea
              rows={2}
              maxLength={500}
              disabled={!noteOpen || saving}
              value={note}
              onChange={(event) => {
                if (saveTarget === "note") setSaveTarget(null);
                setNoteDraft({ saved: savedNote, text: event.target.value });
              }}
            />
          </PublicField>
          <Button
            variant="outline"
            size="sm"
            className="mb-2"
            disabled={!noteOpen || saving || note.trim() === savedNote}
            onClick={() =>
              save("note", (accessToken, locale) =>
                saveMyPollNote(accessToken, locale, note.trim()),
              )
            }
          >
            {m.my_poll_note_save()}
          </Button>
        </>
      )}
      {feedback("note")}
    </section>
  );
}

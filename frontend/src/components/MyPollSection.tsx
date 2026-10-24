import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ANSWER_INPUTS } from "@/components/MyPollAnswers";
import { PublicField, PublicLabel, PublicTextarea } from "@/components/PublicFields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  const [noteConfirmed, setNoteConfirmed] = useState(false);

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
  });
  const { mutate: load } = loadMutation;

  useEffect(() => {
    load();
  }, [load, getAccessToken]);

  if (loadMutation.isError && !poll) {
    return <Alert variant="danger">{m.my_poll_load_error()}</Alert>;
  }
  if (!poll || poll.questions.length === 0) return null;

  const saving = saveMutation.isPending;
  const save = (action: (accessToken: string, locale: string) => Promise<MyPoll>) => {
    setNoteConfirmed(false);
    saveMutation.mutate(action);
  };
  const noted = poll.questions.filter((question) => POLL_KIND_HAS_NOTE[question.kind]);
  const noteOpen = noted.some((question) => !question.closed);
  const savedNote = poll.note ?? "";
  const note = noteDraft && noteDraft.saved === savedNote ? noteDraft.text : savedNote;

  return (
    <Alert variant="secondary">
      <h3 className="text-base font-medium leading-tight">{m.my_poll_heading()}</h3>
      <p className="text-sm mb-4">{m.my_poll_description()}</p>
      {poll.questions.map((question) => {
        const AnswerInput = ANSWER_INPUTS[question.kind];
        return (
          <section key={question.id} className="mb-4" aria-label={question.title}>
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
            <AnswerInput question={question} saving={saving} save={save} />
          </section>
        );
      })}
      {noted.length > 0 && (
        <>
          <PublicField className="mb-2" controlId="my-poll-note">
            <PublicLabel>{m.my_poll_note_label()}</PublicLabel>
            <PublicTextarea
              rows={2}
              maxLength={500}
              disabled={!noteOpen}
              value={note}
              onChange={(event) => {
                setNoteConfirmed(false);
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
              saveMutation.mutate(
                (accessToken, locale) => saveMyPollNote(accessToken, locale, note.trim()),
                { onSuccess: () => setNoteConfirmed(true) },
              )
            }
          >
            {m.my_poll_note_save()}
          </Button>
          {noteConfirmed && (
            <p className="text-sm mb-2" role="status">
              {m.my_poll_note_saved()}
            </p>
          )}
        </>
      )}
      {saveMutation.isError && (
        <Alert variant="danger" className="py-2 text-sm mb-0">
          {apiErrorMessage(saveMutation.error, m.my_poll_save_error())}
        </Alert>
      )}
    </Alert>
  );
}

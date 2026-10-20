import type { ComponentType } from "react";
import { AdminField, AdminInput, AdminLabel, AdminOption, AdminSelect } from "./AdminFields";
import { m } from "@/paraglide/messages";
import type { PollAttendance, PollOrders } from "@/utils/adminContentApi";
import { MAX_POLL_PEOPLE, MAX_POLL_QUANTITY } from "@/utils/myVolunteerApi";
import type { PollQuestionKind } from "@/utils/pollKinds";

type Question = PollOrders["questions"][number];
type Volunteer = PollOrders["volunteers"][number];

/** What an admin entry sends for the volunteer's answers (see `setVolunteerPollOrder`). */
export interface AnswerPayload {
  quantities: Record<string, number>;
  attendance: Record<string, PollAttendance>;
}

interface FieldsProps<Draft> {
  question: Question;
  draft: Draft;
  onChange: (draft: Draft) => void;
}

interface AnswerKind<Draft> {
  /** The form state for the volunteer's current answer (or an empty one). */
  initial: (question: Question, volunteer: Volunteer) => Draft;
  Fields: ComponentType<FieldsProps<Draft>>;
  /** Add the draft's answer to the payload. */
  contribute: (question: Question, draft: Draft, payload: AnswerPayload) => void;
}

type AnswerChoice = "none" | "yes" | "no";
interface YesNoDraft {
  choice: AnswerChoice;
  people: string;
}

const yesNo: AnswerKind<YesNoDraft> = {
  initial: (question, volunteer) => {
    const answer = volunteer.attendance[question.id];
    return {
      choice: answer ? (answer.attending ? "yes" : "no") : "none",
      people: String(answer?.people || 1),
    };
  },
  Fields: ({ question, draft, onChange }) => (
    <div className="flex gap-2 flex-wrap items-end">
      <AdminField controlId={`poll-order-${question.id}`} className="basis-40">
        <AdminLabel className="text-sm text-subtle mb-1">
          {m.admin_poll_order_answer_label()}
        </AdminLabel>
        <AdminSelect
          size="sm"
          className="bg-muted text-content border-input"
          value={draft.choice}
          onValueChange={(value) => onChange({ ...draft, choice: value as AnswerChoice })}
        >
          <AdminOption value="none">{m.poll_answer_none()}</AdminOption>
          <AdminOption value="yes">{m.poll_answer_yes()}</AdminOption>
          <AdminOption value="no">{m.poll_answer_no()}</AdminOption>
        </AdminSelect>
      </AdminField>
      {draft.choice === "yes" && (
        <AdminField controlId={`poll-order-people-${question.id}`} className="basis-40">
          <AdminLabel className="text-sm text-subtle mb-1">
            {m.admin_poll_order_people_label({ title: question.title })}
          </AdminLabel>
          <AdminInput
            type="number"
            size="sm"
            min={1}
            max={MAX_POLL_PEOPLE}
            step={1}
            className="bg-muted text-content border-input max-w-30"
            value={draft.people}
            onChange={(event) => onChange({ ...draft, people: event.target.value })}
          />
        </AdminField>
      )}
    </div>
  ),
  contribute: (question, draft, payload) => {
    payload.attendance[question.id] = {
      attending: draft.choice === "none" ? null : draft.choice === "yes",
      people: Math.min(Math.max(Number(draft.people) || 1, 1), MAX_POLL_PEOPLE),
    };
  },
};

interface MealsDraft {
  quantities: Record<string, string>;
}

const meals: AnswerKind<MealsDraft> = {
  initial: (question, volunteer) => ({
    quantities: Object.fromEntries(
      question.options.map((option) => [option.id, String(volunteer.quantities[option.id] ?? 0)]),
    ),
  }),
  Fields: ({ question, draft, onChange }) =>
    question.options.map((option) => (
      <AdminField key={option.id} controlId={`poll-order-${option.id}`} className="mb-2">
        <AdminLabel className="text-sm text-subtle mb-1">{option.label}</AdminLabel>
        <AdminInput
          type="number"
          size="sm"
          min={0}
          max={MAX_POLL_QUANTITY}
          step={1}
          className="bg-muted text-content border-input max-w-30"
          value={draft.quantities[option.id] ?? "0"}
          onChange={(event) =>
            onChange({ quantities: { ...draft.quantities, [option.id]: event.target.value } })
          }
        />
      </AdminField>
    )),
  contribute: (question, draft, payload) => {
    for (const option of question.options) {
      payload.quantities[option.id] = Number(draft.quantities[option.id]) || 0;
    }
  },
};

/** The draft of one question's answer; its shape belongs to the question's kind. */
export type AnswerDraft = unknown;

interface AnswerFields {
  initial: (question: Question, volunteer: Volunteer) => AnswerDraft;
  Fields: ComponentType<FieldsProps<AnswerDraft>>;
  contribute: (question: Question, draft: AnswerDraft, payload: AnswerPayload) => void;
}

/** Hides the draft type behind the kind that owns it, so the dialog can treat every kind alike. */
function erase<Draft>(kind: AnswerKind<Draft>): AnswerFields {
  const { Fields } = kind;
  return {
    initial: kind.initial,
    Fields: ({ question, draft, onChange }) => (
      <Fields question={question} draft={draft as Draft} onChange={onChange} />
    ),
    contribute: (question, draft, payload) => kind.contribute(question, draft as Draft, payload),
  };
}

/** How an admin enters each kind of answer for a volunteer. */
export const ANSWER_FIELDS: Record<PollQuestionKind, AnswerFields> = {
  yes_no: erase(yesNo),
  meals: erase(meals),
};

import { m } from "@/paraglide/messages";

/**
 * The kinds of poll question. Everything that differs per kind is keyed by `PollQuestionKind` (here, in
 * `components/admin/pollAnswerFields.tsx`, `components/MyPollAnswers.tsx` and `PollOrdersTable`), so adding a
 * kind to this list fails type-checking until each of them says what to do with it.
 */
export const POLL_QUESTION_KINDS = ["yes_no", "meals"] as const;
export type PollQuestionKind = (typeof POLL_QUESTION_KINDS)[number];

/** An unknown kind from the API reads as the original `meals` question. */
export function parsePollKind(value: unknown): PollQuestionKind {
  return POLL_QUESTION_KINDS.find((kind) => kind === value) ?? "meals";
}

const LABELS: Record<PollQuestionKind, () => string> = {
  yes_no: () => m.admin_poll_question_kind_yes_no(),
  meals: () => m.admin_poll_question_kind_meals(),
};

export function pollKindLabel(kind: PollQuestionKind): string {
  return LABELS[kind]();
}

export interface PollCounts {
  yesCount: number;
  noCount: number;
  peopleTotal: number;
}

const SUMMARIES: Record<PollQuestionKind, ((counts: PollCounts) => string) | null> = {
  yes_no: ({ yesCount, peopleTotal, noCount }) =>
    m.admin_poll_yes_no_summary({ yes: yesCount, people: peopleTotal, no: noCount }),
  meals: null,
};

/** What volunteers answered in one line, or null for a kind that has per-option totals instead. */
export function pollCountsSummary(kind: PollQuestionKind, counts: PollCounts): string | null {
  return SUMMARIES[kind]?.(counts) ?? null;
}

/** Whether admins give the question options (the others only need a title). */
export const POLL_KIND_HAS_OPTIONS: Record<PollQuestionKind, boolean> = {
  yes_no: false,
  meals: true,
};

/** Whether the volunteer's dietary note belongs to the kind (it stays editable while one is open). */
export const POLL_KIND_HAS_NOTE: Record<PollQuestionKind, boolean> = {
  yes_no: false,
  meals: true,
};

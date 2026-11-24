import type {
  PollOptionOut,
  PollOptionUpdate,
  PollQuestionOut,
  PollQuestionUpdate,
} from "@/api-types";
import type { PollOrdersOut } from "@/api-types";
import { m } from "@/paraglide/messages";
import type { DietaryTag } from "../editions/dietaryTags";
import { type PollQuestionKind } from "../editions/pollKinds";
import { adminRequest } from "./adminApi";

export const DIETARY_TAGS: readonly DietaryTag[] = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "lactose_free",
  "contains_nuts",
];

const JSON_HEADERS = { "Content-Type": "application/json" };

export type { PollQuestionKind };

export type PollOption = PollOptionOut;

/** The editable text of an option; a blank French or English label is cleared. */
export interface PollOptionWrite {
  labelNl: string;
  labelFr: string;
  labelEn: string;
  dietaryTags: DietaryTag[];
}

export type PollQuestion = PollQuestionOut;

/** The editable texts of a question; a blank French or English text is cleared. */
export interface PollQuestionWrite {
  eventId?: string | null;
  titleNl: string;
  titleFr: string;
  titleEn: string;
  descriptionNl: string;
  descriptionFr: string;
  descriptionEn: string;
}

function pollOptionBody(write: PollOptionWrite): PollOptionUpdate {
  return {
    label_nl: write.labelNl.trim(),
    label_fr: write.labelFr.trim() || null,
    label_en: write.labelEn.trim() || null,
    dietary_tags: write.dietaryTags,
  };
}

function pollQuestionBody(write: PollQuestionWrite): PollQuestionUpdate {
  return {
    ...(write.eventId === undefined ? {} : { event_id: write.eventId || null }),
    title_nl: write.titleNl.trim(),
    title_fr: write.titleFr.trim() || null,
    title_en: write.titleEn.trim() || null,
    description_nl: write.descriptionNl.trim() || null,
    description_fr: write.descriptionFr.trim() || null,
    description_en: write.descriptionEn.trim() || null,
  };
}

function jsonRequest(method: string, body: unknown) {
  return {
    method,
    headers: { ...JSON_HEADERS },
    body: JSON.stringify(body),
  };
}

export async function fetchPollQuestions(editionId: string): Promise<PollQuestion[]> {
  const response = await adminRequest(
    `/api/poll-questions?edition_id=${encodeURIComponent(editionId)}`,
    {},
    m.admin_content_error_load(),
  );
  const data: PollQuestion[] = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createPollQuestion(
  payload: { editionId: string; kind: PollQuestionKind } & PollQuestionWrite,
): Promise<PollQuestion> {
  const response = await adminRequest(
    "/api/poll-questions",
    jsonRequest("POST", {
      edition_id: payload.editionId,
      kind: payload.kind,
      ...pollQuestionBody(payload),
    }),
    m.admin_content_error_save(),
  );
  return response.json();
}

export async function updatePollQuestion(
  questionId: string,
  write: PollQuestionWrite,
): Promise<PollQuestion> {
  const response = await adminRequest(
    `/api/poll-questions/${questionId}`,
    jsonRequest("PUT", pollQuestionBody(write)),
    m.admin_content_error_save(),
  );
  return response.json();
}

/** Set when a question closes (a past time closes it now); `null` reopens it. */
export async function setPollQuestionClosing(
  questionId: string,
  closesAt: string | null,
): Promise<PollQuestion> {
  const response = await adminRequest(
    `/api/poll-questions/${questionId}`,
    jsonRequest("PUT", { closes_at: closesAt }),
    m.admin_content_error_save(),
  );
  return response.json();
}

/** Delete a question; `confirmAnswers` is required when volunteers already answered it. */
export async function deletePollQuestion(
  questionId: string,

  confirmAnswers = false,
  notify = true,
): Promise<void> {
  await adminRequest(
    `/api/poll-questions/${questionId}?notify=${notify}${confirmAnswers ? "&confirm_answers=true" : ""}`,
    { method: "DELETE" },
    m.admin_content_error_save(),
  );
}

export async function reorderPollQuestions(
  editionId: string,
  orderedIds: string[],
): Promise<PollQuestion[]> {
  const response = await adminRequest(
    "/api/poll-questions/reorder",
    jsonRequest("POST", { edition_id: editionId, ordered_ids: orderedIds }),
    m.admin_content_error_save(),
  );
  const data: PollQuestion[] = await response.json();
  return Array.isArray(data) ? data : [];
}

/** Copy the questions (with their options) of another edition; returns the questions created. */
export async function copyPollQuestions(
  fromEditionId: string,
  toEditionId: string,
): Promise<PollQuestion[]> {
  const response = await adminRequest(
    "/api/poll-questions/copy",
    jsonRequest("POST", { from_edition_id: fromEditionId, to_edition_id: toEditionId }),
    m.admin_content_error_save(),
  );
  const data: PollQuestion[] = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createPollOption(
  payload: { questionId: string } & PollOptionWrite,
): Promise<PollOption> {
  const response = await adminRequest(
    "/api/poll-options",
    jsonRequest("POST", { question_id: payload.questionId, ...pollOptionBody(payload) }),
    m.admin_content_error_save(),
  );
  return response.json();
}

export async function updatePollOption(
  optionId: string,
  write: PollOptionWrite,
): Promise<PollOption> {
  const response = await adminRequest(
    `/api/poll-options/${optionId}`,
    jsonRequest("PUT", pollOptionBody(write)),
    m.admin_content_error_save(),
  );
  return response.json();
}

/** Delete an option; `confirmSelections` is required when volunteers already picked it. */
export async function deletePollOption(
  optionId: string,

  confirmSelections = false,
  notify = true,
): Promise<void> {
  await adminRequest(
    `/api/poll-options/${optionId}?notify=${notify}${confirmSelections ? "&confirm_selections=true" : ""}`,
    { method: "DELETE" },
    m.admin_content_error_save(),
  );
}

export async function reorderPollOptions(
  questionId: string,
  orderedIds: string[],
): Promise<PollOption[]> {
  const response = await adminRequest(
    "/api/poll-options/reorder",
    jsonRequest("POST", { question_id: questionId, ordered_ids: orderedIds }),
    m.admin_content_error_save(),
  );
  const data: PollOption[] = await response.json();
  return Array.isArray(data) ? data : [];
}

/** A volunteer's answer to a yes/no question; `attending` null means not answered. */
export interface PollAttendance {
  attending: boolean | null;
  /** Everyone a yes stands for, the volunteer included. */
  people: number;
}

export type PollOrders = PollOrdersOut;

/**
 * Enter or correct one volunteer's answers (for example from an email): `quantities` replaces all their meal
 * picks for the edition, `attendance` their yes/no answers (a null answer leaves the question unanswered) and
 * `note` their dietary note (empty clears it). `confirmClosed` is required for a change to a closed question.
 */
export async function setVolunteerPollOrder(
  editionId: string,
  volunteerId: string,
  payload: {
    quantities: Record<string, number>;
    attendance: Record<string, PollAttendance>;
    choices: Record<string, string>;
    texts: Record<string, string>;
    ratings: Record<string, number>;
    note: string;
    confirmClosed: boolean;
  },
): Promise<void> {
  await adminRequest(
    `/api/poll-questions/orders/${encodeURIComponent(volunteerId)}?edition_id=${encodeURIComponent(editionId)}`,
    jsonRequest("PUT", {
      selections: Object.entries(payload.quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([option_id, quantity]) => ({ option_id, quantity })),
      attendance: Object.entries(payload.attendance)
        .filter(([, answer]) => answer.attending !== null)
        .map(([question_id, answer]) => ({
          question_id,
          attending: answer.attending,
          people: answer.attending ? answer.people : 0,
        })),
      choices: Object.entries(payload.choices).map(([question_id, option_id]) => ({
        question_id,
        option_id,
      })),
      texts: Object.entries(payload.texts)
        .filter(([, text]) => text.trim())
        .map(([question_id, text]) => ({ question_id, text: text.trim() })),
      ratings: Object.entries(payload.ratings).map(([question_id, rating]) => ({
        question_id,
        rating,
      })),
      note: payload.note.trim(),
      confirm_closed: payload.confirmClosed,
    }),
    m.admin_content_error_save(),
  );
}

export async function fetchPollOrders(editionId: string, locale: string): Promise<PollOrders> {
  const response = await adminRequest(
    `/api/poll-questions/orders?edition_id=${encodeURIComponent(editionId)}&locale=${encodeURIComponent(locale)}`,
    {},
    m.admin_content_error_load(),
  );
  return response.json();
}

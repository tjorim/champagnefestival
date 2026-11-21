import type {
  VolunteerIdentityOut,
  VolunteerPollOptionOut,
  VolunteerPollQuestionOut,
  VolunteerPollOut,
} from "@/api-types";
import { m } from "@/paraglide/messages";
import { apiErrorFromResponse } from "./apiErrors";

export type MyVolunteerIdentity = VolunteerIdentityOut;

/** Fetch the signed-in volunteer's own linked identity (GET /api/me/volunteer). */
export async function getMyVolunteerIdentity(accessToken: string): Promise<MyVolunteerIdentity> {
  const response = await fetch("/api/me/volunteer", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(m.my_eid_load_error());
  return response.json();
}

/**
 * Create the signed-in volunteer's own record (POST /api/me/volunteer/register).
 * Idempotent once linked — a repeat just returns the existing identity.
 */
export async function registerMyVolunteerIdentity(
  accessToken: string,
  params: { name: string; nationalRegisterNumber: string; eidDocumentNumber: string },
): Promise<MyVolunteerIdentity> {
  const response = await fetch("/api/me/volunteer/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      name: params.name,
      national_register_number: params.nationalRegisterNumber,
      eid_document_number: params.eidDocumentNumber,
    }),
  });
  if (!response.ok) throw await apiErrorFromResponse(response, m.my_eid_register_error());
  return response.json();
}

/**
 * Update the signed-in volunteer's own eID document number directly
 * (POST /api/me/volunteer/eid-correction). Checksum-validated server-side,
 * same trust model as registration — see docs/decisions/1006-volunteer-identity-self-service.md.
 */
export async function updateMyEidDocumentNumber(
  accessToken: string,
  eidDocumentNumber: string,
): Promise<MyVolunteerIdentity> {
  const response = await fetch("/api/me/volunteer/eid-correction", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ eid_document_number: eidDocumentNumber }),
  });
  if (!response.ok) throw await apiErrorFromResponse(response, m.my_eid_correction_error());
  return response.json();
}

export type PollOption = VolunteerPollOptionOut;

/** The most of one option a volunteer can ask for (the server enforces the same limit). */
export const MAX_POLL_QUANTITY = 20;

/** The most people one "yes" can stand for, the volunteer included (the server enforces the same limit). */
export const MAX_POLL_PEOPLE = 10;

/** Quantity per option id; an option with none is absent. */
type MyPollSelections = Record<string, number>;

export type MyPollQuestion = VolunteerPollQuestionOut;

export type MyPoll = VolunteerPollOut;

const POLL_URL = "/api/me/volunteer/poll";

async function pollRequest(
  accessToken: string,
  path: string,
  locale: string,
  fallback: string,
  body?: unknown,
): Promise<MyPoll> {
  const response = await fetch(`${POLL_URL}${path}?locale=${encodeURIComponent(locale)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { method: "PUT", body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await apiErrorFromResponse(response, fallback);
  return response.json();
}

/** Fetch the active edition's poll questions (in `locale`) and what this volunteer answered. */
export function getMyPoll(accessToken: string, locale: string): Promise<MyPoll> {
  return pollRequest(accessToken, "", locale, m.my_poll_load_error());
}

/** Replace the volunteer's picks for one meals question; an option with no quantity is dropped. */
export function answerMyMealsQuestion(
  accessToken: string,
  locale: string,
  questionId: string,
  selections: MyPollSelections,
): Promise<MyPoll> {
  return pollRequest(
    accessToken,
    `/questions/${encodeURIComponent(questionId)}`,
    locale,
    m.my_poll_save_error(),
    {
      selections: Object.entries(selections)
        .filter(([, quantity]) => quantity > 0)
        .map(([option_id, quantity]) => ({ option_id, quantity })),
    },
  );
}

/** Answer a yes/no question; `people` counts everyone a yes stands for, the volunteer included. */
export function answerMyYesNoQuestion(
  accessToken: string,
  locale: string,
  questionId: string,
  attending: boolean,
  people: number,
): Promise<MyPoll> {
  return pollRequest(
    accessToken,
    `/questions/${encodeURIComponent(questionId)}`,
    locale,
    m.my_poll_save_error(),
    {
      attending,
      ...(attending ? { people } : {}),
    },
  );
}

/** Save the volunteer's dietary note for the meals (empty clears it). */
export function saveMyPollNote(accessToken: string, locale: string, note: string): Promise<MyPoll> {
  return pollRequest(accessToken, "/note", locale, m.my_poll_save_error(), { note });
}

/** Replace or clear one typed scalar answer. */
export function answerMyScalarQuestion(
  accessToken: string,
  locale: string,
  questionId: string,
  answer: { option_id: string | null } | { text: string | null } | { rating: number | null },
): Promise<MyPoll> {
  return pollRequest(
    accessToken,
    `/questions/${encodeURIComponent(questionId)}`,
    locale,
    m.my_poll_save_error(),
    answer,
  );
}

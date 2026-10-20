import { m } from "@/paraglide/messages";
import { apiErrorFromResponse } from "@/utils/apiErrors";
import type { DietaryTag } from "@/utils/dietaryTags";
import { parsePollKind, type PollQuestionKind } from "@/utils/pollKinds";

export interface MyVolunteerIdentity {
  linked: boolean;
  name: string | null;
  nationalRegisterNumber: string | null;
  eidDocumentNumber: string | null;
}

function parseIdentity(data: unknown): MyVolunteerIdentity {
  const record = data as {
    linked?: unknown;
    name?: unknown;
    national_register_number?: unknown;
    eid_document_number?: unknown;
  };
  return {
    linked: record.linked === true,
    name: typeof record.name === "string" ? record.name : null,
    nationalRegisterNumber:
      typeof record.national_register_number === "string" ? record.national_register_number : null,
    eidDocumentNumber:
      typeof record.eid_document_number === "string" ? record.eid_document_number : null,
  };
}

async function throwDetailOrFallback(response: Response, fallback: string): Promise<never> {
  const data = await response.json().catch(() => ({}));
  throw new Error((data as { detail?: string }).detail ?? fallback);
}

/** Fetch the signed-in volunteer's own linked identity (GET /api/me/volunteer). */
export async function getMyVolunteerIdentity(accessToken: string): Promise<MyVolunteerIdentity> {
  const response = await fetch("/api/me/volunteer", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(m.my_eid_load_error());
  return parseIdentity(await response.json());
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
  if (!response.ok) return throwDetailOrFallback(response, m.my_eid_register_error());
  return parseIdentity(await response.json());
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
  if (!response.ok) return throwDetailOrFallback(response, m.my_eid_correction_error());
  return parseIdentity(await response.json());
}

export interface PollOption {
  id: string;
  /** In the language asked for (Dutch when that language has no label). */
  label: string;
  dietaryTags: DietaryTag[];
}

/** The most of one option a volunteer can ask for (the server enforces the same limit). */
export const MAX_POLL_QUANTITY = 20;

/** The most people one "yes" can stand for, the volunteer included (the server enforces the same limit). */
export const MAX_POLL_PEOPLE = 10;

/** Quantity per option id; an option with none is absent. */
type MyPollSelections = Record<string, number>;

export interface MyPollQuestion {
  id: string;
  kind: PollQuestionKind;
  title: string;
  description: string;
  /** When answers can no longer be changed, or null while the question has no deadline. */
  closesAt: string | null;
  closed: boolean;
  options: PollOption[];
  selections: MyPollSelections;
  /** The answer to a yes/no question; null while unanswered. */
  attending: boolean | null;
  people: number;
}

export interface MyPoll {
  editionId: string | null;
  questions: MyPollQuestion[];
  /** The volunteer's own dietary note, if they left one. */
  note: string | null;
}

const DIETARY_TAGS: readonly string[] = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "lactose_free",
  "contains_nuts",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function parseQuestion(raw: Record<string, unknown>): MyPollQuestion {
  const selections: MyPollSelections = {};
  for (const selection of (Array.isArray(raw.selections) ? raw.selections : []).filter(isRecord)) {
    const quantity = Number(selection.quantity);
    if (typeof selection.option_id === "string" && quantity > 0) {
      selections[selection.option_id] = quantity;
    }
  }
  return {
    id: String(raw.id ?? ""),
    kind: parsePollKind(raw.kind),
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    closesAt: typeof raw.closes_at === "string" ? raw.closes_at : null,
    closed: raw.closed === true,
    options: (Array.isArray(raw.options) ? raw.options : []).filter(isRecord).map((o) => ({
      id: String(o.id ?? ""),
      label: String(o.label ?? ""),
      dietaryTags: Array.isArray(o.dietary_tags)
        ? o.dietary_tags.filter((tag): tag is DietaryTag => DIETARY_TAGS.includes(String(tag)))
        : [],
    })),
    selections,
    attending: typeof raw.attending === "boolean" ? raw.attending : null,
    people: Number(raw.people ?? 0),
  };
}

function parsePoll(data: unknown): MyPoll {
  const record = isRecord(data) ? data : {};
  return {
    editionId: typeof record.edition_id === "string" ? record.edition_id : null,
    questions: (Array.isArray(record.questions) ? record.questions : [])
      .filter(isRecord)
      .map(parseQuestion),
    note: typeof record.note === "string" && record.note ? record.note : null,
  };
}

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
  return parsePoll(await response.json());
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

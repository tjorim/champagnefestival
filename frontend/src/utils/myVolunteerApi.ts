import { m } from "@/paraglide/messages";

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
  label: string;
}

/** The most of one option a volunteer can ask for (the server enforces the same limit). */
export const MAX_POLL_QUANTITY = 20;

/** Quantity per option id; an option with none is absent. */
export type MyPollSelections = Record<string, number>;

export interface MyPollOptions {
  editionId: string | null;
  options: PollOption[];
  selections: MyPollSelections;
}

function parsePollOptions(data: unknown): MyPollOptions {
  const record = data as { edition_id?: unknown; options?: unknown; selections?: unknown };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;
  const rawOptions = Array.isArray(record.options) ? record.options : [];
  const rawSelections = Array.isArray(record.selections) ? record.selections : [];
  const selections: MyPollSelections = {};
  for (const selection of rawSelections.filter(isRecord)) {
    const quantity = Number(selection.quantity);
    if (typeof selection.option_id === "string" && quantity > 0) {
      selections[selection.option_id] = quantity;
    }
  }
  return {
    editionId: typeof record.edition_id === "string" ? record.edition_id : null,
    options: rawOptions
      .filter(isRecord)
      .map((o) => ({ id: String(o.id ?? ""), label: String(o.label ?? "") })),
    selections,
  };
}

/** Fetch the active edition's meal poll options and the quantities this volunteer asked for. */
export async function getMyPollOptions(accessToken: string): Promise<MyPollOptions> {
  const response = await fetch("/api/me/volunteer/poll-options", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(m.my_poll_load_error());
  return parsePollOptions(await response.json());
}

/** Replace the signed-in volunteer's own meal quantities. */
export async function replaceMyPollSelections(
  accessToken: string,
  selections: MyPollSelections,
): Promise<MyPollOptions> {
  const response = await fetch("/api/me/volunteer/poll-selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      selections: Object.entries(selections)
        .filter(([, quantity]) => quantity > 0)
        .map(([option_id, quantity]) => ({ option_id, quantity })),
    }),
  });
  if (!response.ok) return throwDetailOrFallback(response, m.my_poll_save_error());
  return parsePollOptions(await response.json());
}

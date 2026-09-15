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
  kind: "dish" | "soup" | "dinner";
  label: string;
}

export interface MyPollSelections {
  dishOptionId: string | null;
  soupOptionId: string | null;
  dinnerOptionIds: string[];
}

export interface MyPollOptions {
  editionId: string | null;
  options: PollOption[];
  selections: MyPollSelections;
}

function isPollOptionKind(value: unknown): value is PollOption["kind"] {
  return value === "dish" || value === "soup" || value === "dinner";
}

function parsePollOptions(data: unknown): MyPollOptions {
  const record = data as {
    edition_id?: unknown;
    options?: unknown;
    selections?: unknown;
  };
  const rawOptions = Array.isArray(record.options) ? record.options : [];
  const selectionsRecord = (record.selections ?? {}) as {
    dish_option_id?: unknown;
    soup_option_id?: unknown;
    dinner_option_ids?: unknown;
  };
  return {
    editionId: typeof record.edition_id === "string" ? record.edition_id : null,
    options: rawOptions
      .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
      .map((o) => ({
        id: String(o.id ?? ""),
        kind: isPollOptionKind(o.kind) ? o.kind : "dish",
        label: String(o.label ?? ""),
      })),
    selections: {
      dishOptionId:
        typeof selectionsRecord.dish_option_id === "string"
          ? selectionsRecord.dish_option_id
          : null,
      soupOptionId:
        typeof selectionsRecord.soup_option_id === "string"
          ? selectionsRecord.soup_option_id
          : null,
      dinnerOptionIds: Array.isArray(selectionsRecord.dinner_option_ids)
        ? selectionsRecord.dinner_option_ids.filter((id): id is string => typeof id === "string")
        : [],
    },
  };
}

/** Fetch the active edition's meal/dinner poll options and this volunteer's own picks. */
export async function getMyPollOptions(accessToken: string): Promise<MyPollOptions> {
  const response = await fetch("/api/me/volunteer/poll-options", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(m.my_poll_load_error());
  return parsePollOptions(await response.json());
}

/** Replace the signed-in volunteer's own meal/dinner poll picks. */
export async function replaceMyPollSelections(
  accessToken: string,
  selections: MyPollSelections,
): Promise<MyPollOptions> {
  const response = await fetch("/api/me/volunteer/poll-selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      dish_option_id: selections.dishOptionId,
      soup_option_id: selections.soupOptionId,
      dinner_option_ids: selections.dinnerOptionIds,
    }),
  });
  if (!response.ok) return throwDetailOrFallback(response, m.my_poll_save_error());
  return parsePollOptions(await response.json());
}

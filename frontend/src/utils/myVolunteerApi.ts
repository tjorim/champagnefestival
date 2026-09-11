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
 * Flag an eID renewal for admin review (POST /api/me/volunteer/eid-correction).
 * Never writes the record directly — an admin applies the change after review.
 */
export async function submitEidCorrection(
  accessToken: string,
  params: { submissionId: string; newEidDocumentNumber: string; note: string },
): Promise<void> {
  const response = await fetch("/api/me/volunteer/eid-correction", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      submission_id: params.submissionId,
      new_eid_document_number: params.newEidDocumentNumber,
      note: params.note,
    }),
  });
  if (!response.ok) return throwDetailOrFallback(response, m.my_eid_correction_error());
}

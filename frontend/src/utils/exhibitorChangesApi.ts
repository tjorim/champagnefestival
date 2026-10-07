import { m } from "@/paraglide/messages";

export const exhibitorTextFields = [
  "website",
  "description_language",
  "description_nl",
  "description_fr",
  "description_en",
] as const;
export type ExhibitorTextField = (typeof exhibitorTextFields)[number];
export type ExhibitorTexts = Record<ExhibitorTextField, string | null>;
export interface ExhibitorChange {
  id: string;
  exhibitor_id: number;
  exhibitor_name: string;
  status: "pending" | "accepted" | "rejected" | "superseded" | "replaced";
  proposed: Partial<ExhibitorTexts>;
  current: ExhibitorTexts;
  superseded_fields: string[];
  reason: string | null;
}

export class ExhibitorChangeConflictError extends Error {
  constructor() {
    super(m.manager_change_conflict());
  }
}

export async function exhibitorChangesRequest<T>(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  if (response.status === 409) throw new ExhibitorChangeConflictError();
  if (!response.ok) throw new Error(m.manager_error());
  return response.json();
}

export function exhibitorFieldLabel(field: string): string {
  return (
    (
      {
        website: m.admin_item_website_url,
        description_language: m.admin_item_description_language,
        description_nl: m.admin_item_description_nl,
        description_fr: m.admin_item_description_fr,
        description_en: m.admin_item_description_en,
      } as Record<string, () => string>
    )[field]?.() ?? field
  );
}

export function exhibitorStatusLabel(status: ExhibitorChange["status"]): string {
  return {
    pending: m.manager_change_pending,
    accepted: m.manager_change_accepted,
    rejected: m.manager_change_rejected,
    superseded: m.manager_change_superseded,
    replaced: m.manager_change_replaced,
  }[status]();
}

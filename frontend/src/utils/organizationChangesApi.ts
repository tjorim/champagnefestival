import { m } from "@/paraglide/messages";

export const organizationTextFields = [
  "website",
  "description_language",
  "description_nl",
  "description_fr",
  "description_en",
] as const;
export type OrganizationTextField = (typeof organizationTextFields)[number];
export type OrganizationTexts = Record<OrganizationTextField, string | null>;
export interface OrganizationChange {
  id: string;
  organization_id: number;
  organization_name: string;
  status: "pending" | "accepted" | "rejected" | "superseded" | "replaced";
  proposed: Partial<OrganizationTexts> & { image?: string };
  current: OrganizationTexts & { image?: string };
  superseded_fields: string[];
  reason: string | null;
}

export class OrganizationChangeConflictError extends Error {
  constructor() {
    super(m.manager_change_conflict());
  }
}

export async function organizationChangesRequest<T>(
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
  if (response.status === 409) throw new OrganizationChangeConflictError();
  if (!response.ok) throw new Error(m.manager_error());
  return response.json();
}

export function organizationFieldLabel(field: string): string {
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

export function organizationStatusLabel(status: OrganizationChange["status"]): string {
  return {
    pending: m.manager_change_pending,
    accepted: m.manager_change_accepted,
    rejected: m.manager_change_rejected,
    superseded: m.manager_change_superseded,
    replaced: m.manager_change_replaced,
  }[status]();
}

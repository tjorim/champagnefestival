import type { OrganizationChangeOut } from "@/api-types";
import { m } from "@/paraglide/messages";
import { apiErrorFromResponse } from "./apiErrors";

export const organizationTextFields = [
  "website",
  "description_nl",
  "description_fr",
  "description_en",
] as const;
export type OrganizationTextField = (typeof organizationTextFields)[number];
export type OrganizationTexts = Record<OrganizationTextField, string | null>;
export type OrganizationChange = OrganizationChangeOut;

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
  if (!response.ok) throw await apiErrorFromResponse(response, m.manager_error());
  return response.json();
}

export function organizationFieldLabel(field: string): string {
  return (
    (
      {
        website: m.admin_item_website_url,
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

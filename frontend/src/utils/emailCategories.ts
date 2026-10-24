import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { m } from "@/paraglide/messages";

/** An admin-managed email category (#1408), as the admin API returns it. */
export interface EmailCategory {
  key: string;
  name: string;
  description: string | null;
  name_nl: string;
  name_fr: string | null;
  name_en: string | null;
  description_nl: string | null;
  description_fr: string | null;
  description_en: string | null;
  allowed_roles: string[];
  automatic: boolean;
  sort_order: number;
}

export interface EmailCategoryWrite {
  name_nl: string;
  name_fr: string | null;
  name_en: string | null;
  description_nl: string | null;
  description_fr: string | null;
  description_en: string | null;
  allowed_roles: string[];
  sort_order: number;
}

/** One grant of consent for a person and category, and how it ended. */
export interface EmailConsentRecord {
  id: string;
  category_key: string;
  category_name: string;
  source: string;
  granted_at: string;
  revoked_at: string | null;
  revoked_source: string | null;
}

export const emailConsentKeys = {
  categories: ["admin", "email-categories"] as const,
  person: (personId: string) => ["admin", "people", personId, "email-consents"] as const,
};

export function emailRequest<T>(
  path: string,
  authHeaders: () => Record<string, string>,
  fallback: string,
  signal?: AbortSignal,
  body?: unknown,
  method = "GET",
) {
  return fetchJsonOrThrowWithUnauthorized<T>(
    path,
    {
      method,
      signal,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    fallback,
  );
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "self_service":
      return m.admin_email_consent_source_self_service();
    case "registration_form":
      return m.admin_email_consent_source_registration_form();
    default:
      return source;
  }
}

export function revokedSourceLabel(source: string): string {
  switch (source) {
    case "self_service":
      return m.admin_email_consent_revoked_self_service();
    case "admin":
      return m.admin_email_consent_revoked_admin();
    case "merged":
      return m.admin_email_consent_revoked_merged();
    default:
      return source;
  }
}

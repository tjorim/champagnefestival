import type { EmailCategoryOut, EmailConsentOut } from "@/api-types";
import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import { m } from "@/paraglide/messages";

/** An admin-managed email category (#1408), as the admin API returns it. */
export type EmailCategory = EmailCategoryOut;

export type EmailCategoryWrite = Required<
  Omit<import("@/api-types").EmailCategoryCreate, "key" | "name_nl">
> & { name_nl: string };

/** One grant of consent for a person and category, and how it ended. */
export type EmailConsentRecord = EmailConsentOut;

export const emailConsentKeys = {
  categories: ["admin", "email-categories"] as const,
  person: (personId: string) => ["admin", "people", personId, "email-consents"] as const,
};

export function emailRequest<T>(
  path: string,

  fallback: string,
  signal?: AbortSignal,
  body?: unknown,
  method = "GET",
) {
  return fetchJsonOrThrow<T>(
    path,
    {
      method,
      signal,
      headers: { "Content-Type": "application/json" },
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

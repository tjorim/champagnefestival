import { m } from "@/paraglide/messages";

export type ComposedMessageChannel = "announcement" | "push" | "email";
export type ComposedMessageState = "draft" | "scheduled" | "sent";
export type ComposedMessageLocale = "nl" | "en" | "fr";

export const COMPOSED_MESSAGE_LOCALES: readonly ComposedMessageLocale[] = ["nl", "en", "fr"];

export interface ComposedMessage {
  id: string;
  title_nl: string | null;
  title_en: string | null;
  title_fr: string | null;
  body_nl: string | null;
  body_en: string | null;
  body_fr: string | null;
  level: "info" | "warning" | "urgent";
  channels: ComposedMessageChannel[];
  link_url: string | null;
  email_category_key: string | null;
  state: ComposedMessageState;
  scheduled_at: string | null;
  announcement_id: string | null;
  push_audience_snapshot: string[] | null;
  email_audience_snapshot: string[] | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  estimated_push_audience: number;
  push_delivered_count: number;
  push_failed_count: number;
  push_pending_count: number;
  estimated_email_audience: number;
  email_accepted_count: number;
  email_failed_count: number;
  email_skipped_count: number;
  email_pending_count: number;
  member_mail_available: boolean;
}

export function composedChannelLabel(channel: ComposedMessageChannel): string {
  switch (channel) {
    case "announcement":
      return m.admin_composer_channel_announcement();
    case "push":
      return m.admin_composer_channel_push();
    case "email":
      return m.admin_composer_channel_email();
  }
}

export function composedStateLabel(state: ComposedMessageState): string {
  switch (state) {
    case "draft":
      return m.admin_composer_state_draft();
    case "scheduled":
      return m.admin_composer_state_scheduled();
    case "sent":
      return m.admin_composer_state_sent();
  }
}

/**
 * The text delivered for `locale`: that language when both its title and body are filled,
 * otherwise Dutch (the backend's `pick_locale_text`). `fallback` is true when Dutch stands in.
 */
export function composedTextFor(
  item: Pick<
    ComposedMessage,
    "title_nl" | "title_en" | "title_fr" | "body_nl" | "body_en" | "body_fr"
  >,
  locale: ComposedMessageLocale,
): { title: string; body: string; fallback: boolean } {
  const own = { title: item[`title_${locale}`], body: item[`body_${locale}`] };
  if (locale !== "nl" && own.title && own.body) {
    return { title: own.title, body: own.body, fallback: false };
  }
  return { title: item.title_nl ?? "", body: item.body_nl ?? "", fallback: locale !== "nl" };
}

/** Email is refused until member mail is configured, so a draft that needs it cannot be sent. */
export function composedSendBlockedByMail(
  item: Pick<ComposedMessage, "channels" | "member_mail_available">,
): boolean {
  return item.channels.includes("email") && !item.member_mail_available;
}

import type { ComposedMessageOut } from "@/api-types";
import { m } from "@/paraglide/messages";

export type ComposedMessageChannel = "announcement" | "push" | "email";
export type ComposedMessageState = "draft" | "scheduled" | "sent";
export type ComposedMessageLocale = "nl" | "en" | "fr";

export const COMPOSED_MESSAGE_LOCALES: readonly ComposedMessageLocale[] = ["nl", "en", "fr"];

export type ComposedMessage = ComposedMessageOut;

export function composedChannelLabel(channel: ComposedMessage["channels"][number]): string {
  switch (channel) {
    case "announcement":
      return m.admin_composer_channel_announcement();
    case "push":
      return m.admin_composer_channel_push();
    case "email":
      return m.admin_composer_channel_email();
    default:
      return channel;
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

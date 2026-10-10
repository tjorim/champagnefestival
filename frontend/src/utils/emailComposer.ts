import type { Registration } from "@/types/registration";
import { m } from "@/paraglide/messages";
export const MAILTO_MAX_LENGTH = 1800;
export type EmailLanguage = "nl" | "fr" | "en";
export interface EmailDraft {
  recipient: string;
  subject: string;
  body: string;
  language?: EmailLanguage;
}
export type RegistrationEmailTemplate = "general" | "order" | "payment" | "event";
function encodeMailtoField(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
export function buildMailto(draft: EmailDraft): string {
  const body = draft.body.replace(/\r?\n/g, "\r\n");
  return `mailto:${encodeMailtoField(draft.recipient)}?subject=${encodeMailtoField(draft.subject)}&body=${encodeMailtoField(body)}`;
}
function emailCopy(language: EmailLanguage) {
  return {
    dear: m.email_dear({}, { locale: language }),
    regards: m.email_regards({}, { locale: language }),
    registration: m.email_registration({}, { locale: language }),
    contact: m.email_contact({}, { locale: language }),
    order: m.email_order({}, { locale: language }),
    here: m.email_here({}, { locale: language }),
    none: m.email_none({}, { locale: language }),
    payment: m.email_payment({}, { locale: language }),
    reminder: m.email_reminder({}, { locale: language }),
    status: m.email_status({}, { locale: language }),
    due: m.email_due({}, { locale: language }),
    eventInfo: m.email_event_info({}, { locale: language }),
    event: m.email_event({}, { locale: language }),
    date: m.email_date({}, { locale: language }),
    start: m.email_start({}, { locale: language }),
    paid: m.email_paid({}, { locale: language }),
    partial: m.email_partial({}, { locale: language }),
    unpaid: m.email_unpaid({}, { locale: language }),
  };
}
export function buildMemberEmailDraft(
  name: string,
  email: string,
  language: EmailLanguage = "nl",
): EmailDraft {
  const t = emailCopy(language);
  return {
    recipient: email,
    subject: "Champagnefestival",
    body: `${t.dear} ${name},\n\n\n\n${t.regards},\nChampagnefestival`,
    language,
  };
}
export function buildRegistrationEmailDraft(
  registration: Registration,
  template: RegistrationEmailTemplate,
  language: EmailLanguage = registration.person.preferredLanguage ?? "nl",
): EmailDraft {
  const t = emailCopy(language),
    eventName = registration.event?.title ?? registration.eventId,
    eventDate = registration.event?.date ?? "",
    greeting = `${t.dear} ${registration.person.name},`,
    reference = `${t.registration}: ${registration.id}`,
    event = eventDate ? `${eventName} — ${eventDate}` : eventName,
    closing = `\n\n${t.regards},\nChampagnefestival`,
    payment = `${t.status}: ${t[registration.paymentStatus]}${registration.amountDue != null ? `\n${t.due}: €${registration.amountDue.toFixed(2)}` : ""}`,
    orders = registration.orderItems.map((i) => `- ${i.name} × ${i.quantity}`).join("\n") || t.none;
  const content = {
    general: {
      subject: `${eventName} — ${t.registration} ${registration.id}`,
      body: `${greeting}\n\n${t.contact} ${event}.\n${reference}`,
    },
    order: {
      subject: `${eventName} — ${t.order}`,
      body: `${greeting}\n\n${t.here} ${event}:\n${reference}\n${orders}\n${payment}`,
    },
    payment: {
      subject: `${eventName} — ${t.payment}`,
      body: `${greeting}\n\n${t.reminder} ${event}.\n${reference}\n${payment}`,
    },
    event: {
      subject: `${eventName} — ${t.eventInfo}`,
      body: `${greeting}\n\n${t.event}: ${eventName}${eventDate ? `\n${t.date}: ${eventDate}` : ""}${registration.event?.startTime ? `\n${t.start}: ${registration.event.startTime}` : ""}\n${reference}`,
    },
  };
  return {
    recipient: registration.person.email,
    subject: content[template].subject,
    body: content[template].body + closing,
    language,
  };
}

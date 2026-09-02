import type { Registration } from "@/types/registration";

export const MAILTO_MAX_LENGTH = 1800;

export interface EmailDraft {
  recipient: string;
  subject: string;
  body: string;
}

export type RegistrationEmailTemplate = "general" | "order" | "payment" | "event";

export function buildMailto(draft: EmailDraft): string {
  const query = new URLSearchParams({ subject: draft.subject, body: draft.body });
  return `mailto:${encodeURIComponent(draft.recipient)}?${query.toString()}`;
}

export function buildMemberEmailDraft(name: string, email: string): EmailDraft {
  return {
    recipient: email,
    subject: "Champagnefestival",
    body: `Dear ${name},\n\n\n\nKind regards,\nChampagnefestival`,
  };
}

export function buildRegistrationEmailDraft(
  registration: Registration,
  template: RegistrationEmailTemplate,
): EmailDraft {
  const eventName = registration.event?.title ?? registration.eventId;
  const eventDate = registration.event?.date ?? "";
  const greeting = `Dear ${registration.person.name},`;
  const reference = `Registration reference: ${registration.id}`;
  const event = eventDate ? `${eventName} on ${eventDate}` : eventName;
  const closing = "\n\nKind regards,\nChampagnefestival";
  const payment = `Payment status: ${registration.paymentStatus}${
    registration.amountDue != null ? `\nAmount due: €${registration.amountDue.toFixed(2)}` : ""
  }`;
  const orderLines = registration.orderItems.map((item) => `- ${item.name} × ${item.quantity}`);

  const content: Record<RegistrationEmailTemplate, { subject: string; body: string }> = {
    general: {
      subject: `${eventName} — registration ${registration.id}`,
      body: `${greeting}\n\nWe are contacting you about your registration for ${event}.\n${reference}`,
    },
    order: {
      subject: `${eventName} — order summary`,
      body: `${greeting}\n\nHere is the order summary for ${event}:\n${reference}\n${orderLines.length ? orderLines.join("\n") : "No products ordered"}\n${payment}`,
    },
    payment: {
      subject: `${eventName} — outstanding payment`,
      body: `${greeting}\n\nThis is a reminder about the outstanding payment for ${event}.\n${reference}\n${payment}`,
    },
    event: {
      subject: `${eventName} — event information`,
      body: `${greeting}\n\nEvent: ${eventName}${eventDate ? `\nDate: ${eventDate}` : ""}${
        registration.event?.startTime ? `\nStart time: ${registration.event.startTime}` : ""
      }\n${reference}`,
    },
  };
  const selected = content[template];
  return {
    recipient: registration.person.email,
    subject: selected.subject,
    body: selected.body + closing,
  };
}

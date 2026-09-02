import type { Registration } from "@/types/registration";
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
const copy = {
  en: {
    dear: "Dear",
    regards: "Kind regards",
    registration: "registration",
    contact: "We are contacting you about your registration for",
    order: "order summary",
    here: "Here is the order summary for",
    none: "No products ordered",
    payment: "outstanding payment",
    reminder: "This is a reminder about the outstanding payment for",
    status: "Payment status",
    due: "Amount due",
    eventInfo: "event information",
    event: "Event",
    date: "Date",
    start: "Start time",
    paid: "paid",
    partial: "partially paid",
    unpaid: "unpaid",
  },
  nl: {
    dear: "Beste",
    regards: "Met vriendelijke groeten",
    registration: "inschrijving",
    contact: "We nemen contact met je op over je inschrijving voor",
    order: "besteloverzicht",
    here: "Hier is het besteloverzicht voor",
    none: "Geen producten besteld",
    payment: "openstaande betaling",
    reminder: "Dit is een herinnering aan de openstaande betaling voor",
    status: "Betalingsstatus",
    due: "Te betalen",
    eventInfo: "evenementinformatie",
    event: "Evenement",
    date: "Datum",
    start: "Starttijd",
    paid: "betaald",
    partial: "gedeeltelijk betaald",
    unpaid: "onbetaald",
  },
  fr: {
    dear: "Bonjour",
    regards: "Cordialement",
    registration: "inscription",
    contact: "Nous vous contactons au sujet de votre inscription à",
    order: "récapitulatif de commande",
    here: "Voici le récapitulatif de la commande pour",
    none: "Aucun produit commandé",
    payment: "paiement en attente",
    reminder: "Ceci est un rappel concernant le paiement en attente pour",
    status: "Statut du paiement",
    due: "Montant dû",
    eventInfo: "informations sur l’événement",
    event: "Événement",
    date: "Date",
    start: "Heure de début",
    paid: "payé",
    partial: "partiellement payé",
    unpaid: "non payé",
  },
} as const;
export function buildMemberEmailDraft(
  name: string,
  email: string,
  language: EmailLanguage = "nl",
): EmailDraft {
  const t = copy[language];
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
  const t = copy[language],
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

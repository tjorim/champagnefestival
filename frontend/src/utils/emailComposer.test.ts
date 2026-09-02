import { describe, expect, it } from "vitest";
import { buildMailto, buildRegistrationEmailDraft } from "./emailComposer";
import type { Registration } from "@/types/registration";

const registration = {
  id: "reg/1?x",
  person: { name: "Zoë", email: "zoe+vip@example.com" },
  eventId: "event-1",
  event: { title: "Fizz & Food", date: "2026-09-12", startTime: "18:30" },
  orderItems: [{ name: "Brut Réserve", quantity: 2 }],
  paymentStatus: "partial",
  amountDue: 12.5,
  notes: "SECRET NOTE",
  accessibilityNote: "SECRET ACCESS",
  checkInToken: "SECRET TOKEN",
} as Registration;

describe("emailComposer", () => {
  it("encodes every mailto field", () => {
    const url = buildMailto({
      recipient: "zoe+vip@example.com",
      subject: "Fizz & Food?",
      body: "Line 1\n€12.50",
    });
    expect(url).toBe(
      "mailto:zoe%2Bvip%40example.com?subject=Fizz%20%26%20Food%3F&body=Line%201%0D%0A%E2%82%AC12.50",
    );
  });
  it.each(["general", "order", "payment", "event"] as const)(
    "builds the %s template without sensitive fields",
    (template) => {
      const draft = buildRegistrationEmailDraft(registration, template);
      expect(draft.recipient).toBe("zoe+vip@example.com");
      expect(draft.body).toContain("reg/1?x");
      expect(draft.body).not.toMatch(/SECRET NOTE|SECRET ACCESS|SECRET TOKEN/);
    },
  );
  it("limits the order summary to the selected registration's order context", () => {
    const draft = buildRegistrationEmailDraft(registration, "order", "en");
    expect(draft.body).toContain("Brut Réserve × 2");
    expect(draft.body).toContain("Amount due: €12.50");
  });
});

it.each([
  ["nl", "Beste Zoë", "Te betalen"],
  ["fr", "Bonjour Zoë", "Montant dû"],
  ["en", "Dear Zoë", "Amount due"],
] as const)("localises registration drafts in %s", (language, greeting, amountLabel) => {
  const draft = buildRegistrationEmailDraft(registration, "payment", language);
  expect(draft.body).toContain(greeting);
  expect(draft.body).toContain(amountLabel);
  expect(draft.language).toBe(language);
});

import { describe, expect, it } from "vitest";

async function setScenario(scenario: string): Promise<void> {
  const response = await fetch("/api/mock/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  expect(response.ok).toBe(true);
}

function adminAuthHeaders(token = "dev-token"): Record<string, string> {
  return { Authorization: "Bearer ".concat(token) };
}

describe("MSW operational fixtures", () => {
  it("switches to the event-day scenario for operational admin views", async () => {
    await setScenario("event-day");

    const registrationsResponse = await fetch("/api/registrations", {
      headers: adminAuthHeaders(),
    });
    expect(registrationsResponse.status).toBe(200);
    const registrations = (await registrationsResponse.json()) as Array<Record<string, unknown>>;

    const reg01 = registrations.find((registration) => registration.id === "reg-01");
    expect(reg01?.checked_in).toBe(true);
    expect(reg01?.strap_issued).toBe(true);
  });

  it("exposes partial and completed delivery quantities in deterministic seed data", async () => {
    const registrationsResponse = await fetch("/api/registrations", {
      headers: adminAuthHeaders(),
    });
    expect(registrationsResponse.status).toBe(200);
    const registrations = (await registrationsResponse.json()) as Array<Record<string, unknown>>;

    const regPartial = registrations.find((registration) => registration.id === "reg-01");
    const regComplete = registrations.find((registration) => registration.id === "reg-02");
    expect(regPartial).toBeTruthy();
    expect(regComplete).toBeTruthy();

    const partialOrder = (regPartial?.pre_orders as Array<Record<string, unknown>> | undefined)?.[0];
    if (!partialOrder) throw new Error("Expected partial delivery order in reg-01");
    expect(partialOrder.quantity).toBe(4);
    expect(partialOrder.delivered_quantity).toBe(2);
    expect(partialOrder.delivered).toBe(false);

    const completedOrder = (regComplete?.pre_orders as Array<Record<string, unknown>> | undefined)?.[0];
    if (!completedOrder) throw new Error("Expected completed delivery order in reg-02");
    expect(completedOrder.quantity).toBe(2);
    expect(completedOrder.delivered_quantity).toBe(2);
    expect(completedOrder.delivered).toBe(true);
  });

  it("supports explicit auth error scenarios for regression tests", async () => {
    await setScenario("auth-expired");

    const response = await fetch("/api/registrations", {
      headers: adminAuthHeaders(),
    });
    expect(response.status).toBe(401);

    const payload = (await response.json()) as { detail?: string };
    expect(payload.detail).toBe("Token expired");
  });
});

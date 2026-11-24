import { http, HttpResponse } from "msw/http";
import {
  activeScenario,
  availableMockScenarios,
  applyMockScenario,
  type MockScenario,
} from "./auth";

export const scenarioHandlers = [
  http.get("/api/mock/scenario", () => {
    return HttpResponse.json({
      active: activeScenario,
      available: availableMockScenarios,
    });
  }),

  http.post("/api/mock/scenario", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { scenario?: string } | null;
    const scenario = body?.scenario as MockScenario | undefined;
    const availableScenarios = new Set<MockScenario>(availableMockScenarios);
    if (!scenario || !availableScenarios.has(scenario)) {
      return HttpResponse.json(
        {
          detail: "Unknown scenario",
          available: [...availableScenarios],
        },
        { status: 400 },
      );
    }
    applyMockScenario(scenario);
    return HttpResponse.json({ ok: true, active: activeScenario });
  }),
];

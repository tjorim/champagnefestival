import { HttpResponse } from "msw/http";
import {
  type RegistrationScenario,
  resetSharedStore,
  setRegistrationScenario,
} from "../../data/registrations";

export const validAdminTokens = new Set(["dev-token", "mock-access-token"]);
type AuthScenario = "signed-out" | "forbidden" | "expired" | "invalid";
type ForcedAuthScenario = "default" | AuthScenario;
export type MockScenario = "default" | RegistrationScenario | `auth-${AuthScenario}`;

export let activeScenario: MockScenario = "default";
export let forcedAuthScenario: ForcedAuthScenario = "default";
export const availableMockScenarios: MockScenario[] = [
  "default",
  "event-day",
  "auth-signed-out",
  "auth-forbidden",
  "auth-expired",
  "auth-invalid",
];

export function authError(status: number, detail: string): HttpResponse<{ detail: string }> {
  return HttpResponse.json({ detail }, { status });
}

export function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function requireAuth(request: Request): HttpResponse<{ detail: string }> | null {
  if (forcedAuthScenario === "signed-out") {
    return authError(401, "Not authenticated");
  }
  if (forcedAuthScenario === "forbidden") {
    return authError(403, "Forbidden");
  }
  if (forcedAuthScenario === "expired") {
    return authError(401, "Token expired");
  }
  if (forcedAuthScenario === "invalid") {
    return authError(401, "Invalid token");
  }

  const token = parseBearerToken(request);
  if (!token) return authError(401, "Not authenticated");
  if (token === "forbidden-token") return authError(403, "Forbidden");
  if (token === "expired-token") return authError(401, "Token expired");
  if (token === "invalid-token") return authError(401, "Invalid token");
  if (!validAdminTokens.has(token)) return authError(401, "Invalid token");

  return null;
}

export function applyMockScenario(scenario: MockScenario): void {
  activeScenario = scenario;
  forcedAuthScenario = "default";

  switch (scenario) {
    case "default":
      resetSharedStore();
      return;
    case "event-day":
      setRegistrationScenario("event-day");
      return;
    case "auth-signed-out":
      forcedAuthScenario = "signed-out";
      return;
    case "auth-forbidden":
      forcedAuthScenario = "forbidden";
      return;
    case "auth-expired":
      forcedAuthScenario = "expired";
      return;
    case "auth-invalid":
      forcedAuthScenario = "invalid";
      return;
  }
}

/** Back to the signed-in default scenario. */
export function resetAuthScenario(): void {
  activeScenario = "default";
  forcedAuthScenario = "default";
}

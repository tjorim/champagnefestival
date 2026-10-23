import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { useMaintenanceMode } from "./useMaintenanceMode";

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useMaintenanceMode(), { wrapper }) };
}

/** Answers the settings endpoint with the given responses in turn (the last one repeats) and counts the requests. */
function serveMaintenance(...responses: (() => Response)[]) {
  let calls = 0;
  server.use(
    http.get("/api/settings", () => {
      const respond = responses[Math.min(calls, responses.length - 1)]!;
      calls += 1;
      return respond();
    }),
  );
  return { calls: () => calls };
}

describe("useMaintenanceMode", () => {
  it("does not enable maintenance mode for a 429 response", async () => {
    const api = serveMaintenance(() => new HttpResponse(null, { status: 429 }));
    const { result } = setup();

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.isMaintenanceMode).toBe(false);
    expect(api.calls()).toBe(1);
  });

  it("fails closed for a 500 response on a cold load", async () => {
    const api = serveMaintenance(() => new HttpResponse(null, { status: 500 }));
    const { result } = setup();

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.isMaintenanceMode).toBe(true);
    expect(api.calls()).toBe(3);
  });

  it("keeps the last good value when a refetch fails", async () => {
    const api = serveMaintenance(
      () => HttpResponse.json({ maintenance_mode: false }),
      () => new HttpResponse(null, { status: 500 }),
    );
    const { client, result } = setup();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(() => client.refetchQueries({ queryKey: ["maintenance-mode"] }));

    expect(result.current.isMaintenanceMode).toBe(false);
    expect(api.calls()).toBe(4);
  });
});

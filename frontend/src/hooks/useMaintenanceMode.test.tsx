import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => vi.unstubAllGlobals());

describe("useMaintenanceMode", () => {
  it("does not enable maintenance mode for a 429 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    const { result } = setup();

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.isMaintenanceMode).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed for a 500 response on a cold load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const { result } = setup();

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.isMaintenanceMode).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps the last good value when a refetch fails", async () => {
    const mockedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ maintenance_mode: false })))
      .mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", mockedFetch);
    const { client, result } = setup();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(() => client.refetchQueries({ queryKey: ["maintenance-mode"] }));

    expect(result.current.isMaintenanceMode).toBe(false);
    expect(mockedFetch).toHaveBeenCalledTimes(4);
  });
});

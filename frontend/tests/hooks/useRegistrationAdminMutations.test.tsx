import { onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import { useRegistrationAdminMutations } from "@/hooks/useRegistrationAdminMutations";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

describe("useRegistrationAdminMutations", () => {
  it("wires registration updates and invalidates only the registrations key", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const seen = {
      authorization: "",
      body: {} as Record<string, unknown>,
    };

    server.use(
      http.put("/api/registrations/reg-1", async ({ request }) => {
        seen.authorization = request.headers.get("authorization") ?? "";
        seen.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "reg-1", ...seen.body });
      }),
    );

    const { result } = renderHook(
      () =>
        useRegistrationAdminMutations({
          queryClient,
          authHeaders: () => ({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
          registrationsQueryKey: ["admin", "registrations"],
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.updateRegistrationMutation.mutateAsync({
        id: "reg-1",
        payload: { checked_in: true },
        fallbackMessage: "Could not check in.",
      });
    });

    expect(seen.authorization).toBe("Bearer test-token");
    expect(seen.body).toEqual({ checked_in: true });
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin", "registrations"] });
    });
    // Table occupancy is derived from the registrations, so a seating write has
    // no second cache to invalidate.
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["admin", "tables"] });
  });
});

it.each([{ checked_in: true }, { checked_in: false }, { strap_issued: true }, { order_items: [] }])(
  "rejects offline entrance writes without replay on reconnect: %j",
  async (payload) => {
    const originalOnline = navigator.onLine;
    const request = vi.fn(() => HttpResponse.json({ id: "reg-1" }));
    server.use(http.put("/api/registrations/reg-1", request));
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const { result, unmount } = renderHook(
      () =>
        useRegistrationAdminMutations({
          queryClient,
          authHeaders: () => ({}),
          registrationsQueryKey: ["admin", "registrations"],
        }),
      { wrapper: Wrapper },
    );
    try {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      onlineManager.setOnline(false);
      await act(async () => {
        await expect(
          result.current.updateEntranceMutation.mutateAsync({
            id: "reg-1",
            payload,
            fallbackMessage: "Could not update attendance.",
          }),
        ).rejects.toThrow("live connection");
      });
      expect(result.current.updateEntranceMutation.isPaused).toBe(false);
      expect(request).not.toHaveBeenCalled();
      await act(async () => {
        Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
        onlineManager.setOnline(true);
      });
      expect(request).not.toHaveBeenCalled();
    } finally {
      unmount();
      queryClient.clear();
      Object.defineProperty(navigator, "onLine", { value: originalOnline, configurable: true });
      onlineManager.setOnline(true);
    }
  },
);

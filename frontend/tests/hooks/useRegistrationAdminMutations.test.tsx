import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useRegistrationAdminMutations } from "@/hooks/useRegistrationAdminMutations";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

describe("useRegistrationAdminMutations", () => {
  it("wires registration updates and invalidates registration/table keys", async () => {
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
          tablesQueryKey: ["admin", "tables"],
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
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin", "tables"] });
    });
  });
});

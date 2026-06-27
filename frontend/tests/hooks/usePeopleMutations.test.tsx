import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { usePeopleMutations } from "@/hooks/usePeopleMutations";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

describe("usePeopleMutations", () => {
  it("wires create person requests and invalidates people/member keys", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const seen = {
      authorization: "",
      body: {} as Record<string, unknown>,
    };

    server.use(
      http.post("/api/people", async ({ request }) => {
        seen.authorization = request.headers.get("authorization") ?? "";
        seen.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "per_1", ...seen.body });
      }),
    );

    const { result } = renderHook(
      () =>
        usePeopleMutations({
          queryClient,
          authHeaders: () => ({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
          peopleQueryKey: ["admin", "people"],
          membersQueryKey: ["admin", "members"],
          registrationsQueryKey: ["admin", "registrations"],
          exhibitorsQueryKey: ["admin", "exhibitors"],
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.createPersonMutation.mutateAsync({
        name: "Ada Lovelace",
        email: "",
        phone: "+32470123456",
        address: "Rue Royale 1",
        roles: ["member"],
        notes: "VIP",
        clubName: "Analytical Society",
        active: true,
      });
    });

    expect(seen.authorization).toBe("Bearer test-token");
    expect(seen.body).toEqual({
      name: "Ada Lovelace",
      email: null,
      phone: "+32470123456",
      address: "Rue Royale 1",
      roles: ["member"],
      notes: "VIP",
      club_name: "Analytical Society",
      active: true,
    });
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin", "people"] });
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin", "members"] });
    });
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { usePeopleMutations } from "@/hooks/usePeopleMutations";
import { server } from "@/mocks/server";
import type { AdminPeopleCollection } from "@/state/adminPeopleCollection";
import { createTestQueryClientHarness } from "../utils/queryClient";

describe("usePeopleMutations", () => {
  it("wires create person requests and refetches the people collection", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const refetchPeople = vi.fn().mockResolvedValue(undefined);
    const peopleCollection = {
      utils: { refetch: refetchPeople },
    } as unknown as AdminPeopleCollection;
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
          peopleCollection,
          registrationsQueryKey: ["admin", "registrations"],
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
      expect(refetchPeople).toHaveBeenCalledTimes(1);
    });
    // The per-person queries nested under the people key are still invalidated,
    // but never the collection's own key: that is refetched explicitly.
    const calls = invalidateQueries.mock.calls.map(([filters]) => filters);
    expect(calls).not.toContainEqual({ queryKey: ["admin", "people"] });
    expect(calls).toContainEqual(
      expect.objectContaining({ queryKey: ["admin", "people"], predicate: expect.any(Function) }),
    );
  });
});

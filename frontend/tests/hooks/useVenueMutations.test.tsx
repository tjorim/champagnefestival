import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useVenueMutations } from "@/hooks/useVenueMutations";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

describe("useVenueMutations", () => {
  it("wires create layout requests with the active edition", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const seen = {
      authorization: "",
      body: {} as Record<string, unknown>,
    };

    server.use(
      http.post("/api/layouts", async ({ request }) => {
        seen.authorization = request.headers.get("authorization") ?? "";
        seen.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "lay_1", ...seen.body });
      }),
    );

    const { result } = renderHook(
      () =>
        useVenueMutations({
          queryClient,
          authHeaders: () => ({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
          tablesQueryKey: ["admin", "tables"],
          venuesQueryKey: ["admin", "venues"],
          roomsQueryKey: ["admin", "rooms"],
          tableTypesQueryKey: ["admin", "table-types"],
          layoutsQueryKey: ["admin", "layouts"],
          areasQueryKey: ["admin", "areas"],
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.createLayoutMutation.mutateAsync({
        roomId: "room-1",
        eventId: "event-1",
        label: "  Saturday evening  ",
      });
    });

    expect(seen.authorization).toBe("Bearer test-token");
    expect(seen.body).toEqual({
      room_id: "room-1",
      event_id: "event-1",
      label: "Saturday evening",
    });
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin", "layouts"] });
    });
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useVenueMutations } from "@/hooks/useVenueMutations";
import { server } from "@/mocks/server";
import { createAdminTablesCollection } from "@/state/adminTablesCollection";
import { createAdminVenueCollections } from "@/state/adminVenueCollections";
import { createTestQueryClientHarness } from "../utils/queryClient";

describe("useVenueMutations", () => {
  it("wires create layout requests with the active edition", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const venueCollections = createAdminVenueCollections({
      queryClient,
      authHeaders: () => ({}),
      enabled: false,
    });
    const refetch = vi.spyOn(venueCollections.layouts.utils, "refetch").mockResolvedValue([]);
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
          authHeaders: () => ({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
          tablesCollection: createAdminTablesCollection({
            queryClient,
            authHeaders: () => ({}),
            enabled: false,
          }),
          venueCollections,
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
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });
});

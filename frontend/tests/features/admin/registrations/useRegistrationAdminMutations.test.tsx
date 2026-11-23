import { jsonResponse } from "@/mocks/response";
import { onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import { useRegistrationAdminMutations } from "@/features/admin/registrations/useRegistrationAdminMutations";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../../../utils/queryClient";

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
        return jsonResponse<import("@/api-types").RegistrationOut>({
          poll_question_id: null,
          stamp_progress: null,
          order_answers: [],
          booked_table_quantity: 0,
          allocations: [],
          person_id: "",
          person: { id: "", name: "", email: "", phone: "", preferred_language: null },
          event_id: "",
          event: {
            title: "",
            description: "",
            title_nl: null,
            title_fr: null,
            title_en: null,
            description_nl: null,
            description_fr: null,
            description_en: null,
            id: "",
            edition_id: "",
            date: "2026-01-01",
            start_time: "",
            end_time: null,
            category: "",
            volunteers_only: false,
            members_only: false,
            registration_required: false,
            registrations_open_from: null,
            registrations_close_at: null,
            active: false,
            edition: null,
            order_questions: [],
            products: [],
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
          guest_count: 0,
          order_items: [],
          notes: "",
          table_id: null,
          status: "pending",
          payment_status: "unpaid",
          amount_due: null,
          amount_paid: "0",
          refund_due: "0",
          checked_in: false,
          checked_in_at: null,
          strap_issued: false,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          id: "reg-1",
          ...seen.body,
        });
      }),
    );

    const { result } = renderHook(
      () =>
        useRegistrationAdminMutations({
          queryClient,

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

    expect(seen.authorization).toBe("Bearer mock-access-token");
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
    const request = vi.fn(() =>
      HttpResponse.json(
        /* Fixture exception: mock-control sentinel; this handler must never be called. */ {
          id: "reg-1",
        },
      ),
    );
    server.use(http.put("/api/registrations/reg-1", request));
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const { result, unmount } = renderHook(
      () =>
        useRegistrationAdminMutations({
          queryClient,

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

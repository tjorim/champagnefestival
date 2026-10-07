import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { useAdminPeopleActions } from "@/hooks/useAdminPeopleActions";
import type { AdminOrganizationsCollection } from "@/state/adminOrganizationsCollection";
import type { AdminRegistrationsCollection } from "@/state/adminRegistrationsCollection";
import { resetAdminPeopleSession } from "@/state/adminPeopleSession";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

function harness() {
  const { queryClient, Wrapper } = createTestQueryClientHarness();
  const refetchRegistrations = vi.fn().mockResolvedValue(undefined);
  const refetchOrganizations = vi.fn().mockResolvedValue(undefined);
  const writeUpsert = vi.fn().mockResolvedValue(undefined);
  const registrationsCollection = {
    utils: { refetch: refetchRegistrations },
    get: vi.fn(),
  } as unknown as AdminRegistrationsCollection;
  const organizationsCollection = {
    utils: { refetch: refetchOrganizations, writeUpsert },
    values: () => [{ id: 1, name: "House", active: true, contactPersonId: "duplicate" }],
  } as unknown as AdminOrganizationsCollection;
  const view = renderHook(
    () =>
      useAdminPeopleActions({
        authHeaders: () => ({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        }),
        queryClient,
        registrationsQueryKey: ["admin", "registrations"],
        registrationsCollection,
        organizationsCollection,
        setDetailRegistration: vi.fn(),
      }),
    { wrapper: Wrapper },
  );
  return { ...view, queryClient, refetchRegistrations, refetchOrganizations, writeUpsert };
}
it.each([200, 409])(
  "reconciles both cascade consumers after a merge returns %s",
  async (status) => {
    const h = harness();
    server.use(
      http.post("/api/people/:id/merge/:duplicateId", () =>
        HttpResponse.json({ id: "canonical", roles: ["volunteer"] }, { status }),
      ),
    );
    await act(async () => {
      await h.result.current.handleMergePeople("canonical", "duplicate").catch(() => undefined);
    });
    expect(h.refetchRegistrations).toHaveBeenCalled();
    expect(h.refetchOrganizations).toHaveBeenCalled();
    if (status === 200)
      expect(h.writeUpsert).toHaveBeenCalledWith([
        { id: 1, name: "House", active: true, contactPersonId: "canonical" },
      ]);
    // No merge response is inserted into a people cache with invented help periods.
    expect(h.queryClient.getQueryData(["admin", "people"])).toBeUndefined();
  },
);
it("drops a late merge response after sign-out", async () => {
  const h = harness();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.use(
    http.post("/api/people/:id/merge/:duplicateId", async () => {
      started();
      await gate;
      return HttpResponse.json({ id: "canonical" });
    }),
  );
  let promise!: Promise<void>;
  act(() => {
    promise = h.result.current.handleMergePeople("canonical", "duplicate");
  });
  await request;
  resetAdminPeopleSession();
  release();
  await act(async () => {
    await promise;
  });
  expect(h.refetchRegistrations).not.toHaveBeenCalled();
  expect(h.refetchOrganizations).not.toHaveBeenCalled();
  expect(h.writeUpsert).not.toHaveBeenCalled();
});

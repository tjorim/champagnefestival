import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAdminRegistrationActions } from "@/hooks/useAdminRegistrationActions";
import type { Registration } from "@/types/registration";
import { createTestQueryClientHarness } from "../utils/queryClient";

const registrationsQueryKey = ["admin", "registrations"] as const;

function renderActions() {
  const { queryClient, Wrapper } = createTestQueryClientHarness();
  const view = renderHook(
    () =>
      useAdminRegistrationActions({
        authHeaders: () => ({}),
        queryClient,
        registrationsQueryKey,
        setDetailRegistration: vi.fn(),
        setRegistrationError: vi.fn(),
        confirmOverCapacity: () => Promise.resolve(false),
      }),
    { wrapper: Wrapper },
  );
  return { queryClient, ...view };
}

const created = { id: "reg-new" } as Registration;

describe("handleAddRegistration", () => {
  it("prepends the booking to a loaded list", () => {
    const { queryClient, result } = renderActions();
    queryClient.setQueryData(registrationsQueryKey, [{ id: "reg-old" }]);

    result.current.handleAddRegistration(created);

    expect(
      queryClient.getQueryData<Registration[]>(registrationsQueryKey)?.map((r) => r.id),
    ).toEqual(["reg-new", "reg-old"]);
  });

  it("does not seed an unloaded or signed-out list with a single booking", () => {
    const { queryClient, result } = renderActions();

    result.current.handleAddRegistration(created);

    expect(queryClient.getQueryData(registrationsQueryKey)).toBeUndefined();
  });
});

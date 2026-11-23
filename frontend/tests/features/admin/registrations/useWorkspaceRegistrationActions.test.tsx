import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http } from "msw/http";
import { expect, it, vi } from "vitest";
import type { RegistrationOut } from "@/api-types";
import { useWorkspaceRegistrationActions } from "@/features/admin/registrations/useWorkspaceRegistrationActions";
import { AdminWorkspaceContext } from "@/features/admin/shell/AdminWorkspace";
import { useAdminQueries } from "@/features/admin/shell/useAdminQueries";
import { useActiveEdition } from "@/hooks/useActiveEdition";
import { queryKeys } from "@/lib/query/queryKeys";
import { registrationOut } from "@/mocks/data/builders";
import { jsonResponse } from "@/mocks/response";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../../../utils/queryClient";

it("saves allocations against the registration working set supplied by the workspace", async () => {
  const registration = registrationOut({ id: "reg-workspace" });
  const allocations = [{ table_id: "table-02", guest_count: 1, exclusive: false }];
  const setDetailRegistration = vi.fn();
  const setRegistrationError = vi.fn();
  const save = vi.fn();
  const { queryClient, Wrapper } = createTestQueryClientHarness();
  const key = queryKeys.admin.registrationsEdition("workspace-edition");
  server.use(
    http.put("/api/registrations/reg-workspace", async ({ request }) => {
      save(await request.json());
      return jsonResponse<RegistrationOut>({ ...registration, allocations });
    }),
  );

  function Workspace({ children }: { children: ReactNode }) {
    const { edition } = useActiveEdition("any");
    const queries = useAdminQueries({
      editionId: "workspace-edition",
      visible: false,
      isAuthenticated: true,
      canManageAdminSections: true,
    });
    return (
      <AdminWorkspaceContext.Provider
        value={{
          queries,
          activeEdition: edition,
          activeEditionLoaded: true,
          canManageAdminSections: true,
          applyActiveEditionFilterRequest: 0,
          detailRegistration: null,
          setDetailRegistration,
          registrationError: "",
          setRegistrationError,
        }}
      >
        {children}
      </AdminWorkspaceContext.Provider>
    );
  }

  const { result } = renderHook(useWorkspaceRegistrationActions, {
    wrapper: ({ children }) => (
      <Wrapper>
        <Workspace>{children}</Workspace>
      </Wrapper>
    ),
  });
  queryClient.setQueryData(key, [registration]);
  await act(() => result.current.handleSaveAllocations(registration.id, allocations));

  expect(save).toHaveBeenCalledExactlyOnceWith({ allocations, confirm_over_capacity: false });
  await waitFor(() =>
    expect(queryClient.getQueryData(key)).toEqual([{ ...registration, allocations }]),
  );
  expect(setDetailRegistration).toHaveBeenCalledOnce();
  expect(setRegistrationError).not.toHaveBeenCalled();
});

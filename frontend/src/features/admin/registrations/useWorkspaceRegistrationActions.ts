import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useAdminWorkspace } from "../shell/AdminWorkspace";
import { useAdminRegistrationActions } from "../shell/useAdminRegistrationActions";

export function useWorkspaceRegistrationActions() {
  const {
    queries: { registrationsQueryKey },
    setDetailRegistration,
    setRegistrationError,
  } = useAdminWorkspace();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const confirmOverCapacity = useCallback(
    () =>
      confirm({
        title: m.admin_table_over_capacity_title(),
        body: m.admin_table_over_capacity_confirm(),
        confirmLabel: m.admin_action_confirm(),
        variant: "warning",
        icon: "exclamation-triangle",
        errorFallback: m.admin_error_assign_table(),
      }),
    [confirm],
  );

  return {
    ...useAdminRegistrationActions({
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      setRegistrationError,
      confirmOverCapacity,
    }),
    confirmDialog,
  };
}
